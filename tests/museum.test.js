const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function loadMuseumPage() {
  const pagePath = path.join(root, 'pages/museum/index.js')
  const originalPage = global.Page
  let definition

  global.Page = (value) => { definition = value }
  delete require.cache[require.resolve(pagePath)]
  require(pagePath)
  global.Page = originalPage

  return {
    ...definition,
    data: { ...definition.data },
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    }
  }
}

test('museum catalog contains ten complete and uniquely identified ceramics', () => {
  const ceramics = require(path.join(root, 'data/ceramics'))
  const dynasties = new Set(['唐代', '宋代', '元代', '明代', '清代'])

  assert.equal(ceramics.length, 10)
  assert.equal(new Set(ceramics.map((item) => item.id)).size, 10)
  ceramics.forEach((item) => {
    assert.ok(item.id && item.name && item.dynasty && item.image)
    assert.ok(dynasties.has(item.dynasty), `${item.id} has an unsupported dynasty`)
    assert.ok(fs.existsSync(path.join(root, item.image.replace(/^\//, ''))), `${item.image} is missing`)
  })
  dynasties.forEach((dynasty) => {
    assert.ok(ceramics.some((item) => item.dynasty === dynasty), `${dynasty} has no collection item`)
  })
})

test('museum search and dynasty filters work together', () => {
  const filterPath = path.join(root, 'utils/filter-ceramics.js')
  assert.ok(fs.existsSync(filterPath), 'ceramic filter module is missing')
  const filterCeramics = require(filterPath)
  const ceramics = require(path.join(root, 'data/ceramics'))

  assert.deepEqual(
    filterCeramics(ceramics, '青花', '全部').map((item) => item.id),
    ['ceramic-001', 'ceramic-005', 'ceramic-009']
  )
  assert.deepEqual(
    filterCeramics(ceramics, '青花', '元代').map((item) => item.id),
    ['ceramic-005', 'ceramic-009']
  )
  assert.deepEqual(
    filterCeramics(ceramics, '  鸡缸  ', '全部').map((item) => item.id),
    ['ceramic-010']
  )
  assert.equal(filterCeramics(ceramics, '不存在', '全部').length, 0)
  assert.equal(filterCeramics(ceramics, '', '宋代').length, 3)
})

test('museum page combines live search with dynasty selection and preserves card ids', () => {
  const page = loadMuseumPage()

  assert.equal(typeof page.onSearchInput, 'function')
  assert.equal(typeof page.selectDynasty, 'function')
  assert.equal(typeof page.selectCeramic, 'function')
  page.onSearchInput({ detail: { value: '青花' } })
  assert.deepEqual(page.data.filteredCeramics.map((item) => item.id), ['ceramic-001', 'ceramic-005', 'ceramic-009'])
  page.selectDynasty({ currentTarget: { dataset: { dynasty: '元代' } } })
  assert.deepEqual(page.data.filteredCeramics.map((item) => item.id), ['ceramic-005', 'ceramic-009'])
  page.onSearchInput({ detail: { value: '' } })
  assert.equal(page.data.filteredCeramics.length, 2)
  page.selectCeramic({ detail: { id: 'ceramic-009' } })
  assert.equal(page.data.selectedCeramicId, 'ceramic-009')
})

test('museum brand stays above the search area under a custom navigation bar', () => {
  const originalWx = global.wx
  global.wx = {
    getWindowInfo() { return { windowWidth: 390 } },
    getMenuButtonBoundingClientRect() { return { top: 48, bottom: 80 } }
  }
  const page = loadMuseumPage()

  page.onLoad()
  assert.equal(page.data.navTop, 48)
  assert.equal(page.data.brandTop, 64)
  assert.ok(page.data.heroHeight >= 144)
  global.wx = originalWx
})

test('museum template renders a custom hero, search, six filters and dense image cards', () => {
  const template = fs.readFileSync(path.join(root, 'pages/museum/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/museum/index.wxss'), 'utf8')
  const cardTemplate = fs.readFileSync(path.join(root, 'components/ceramic-card/index.wxml'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/museum/index.json'), 'utf8'))

  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /class="museum-hero"/)
  assert.match(template, /<input[^>]+bindinput="onSearchInput"/)
  assert.match(template, /wx:for="\{\{dynasties\}\}"/)
  assert.match(template, /<ceramic-card[^>]+wx:for="\{\{filteredCeramics\}\}"/)
  assert.equal((template.match(/wx:for="\{\{filteredCeramics\}\}"/g) || []).length, 1)
  assert.match(cardTemplate, /<image[^>]+src="\{\{item\.image\}\}"[^>]+mode="aspectFill"/)
  assert.match(cardTemplate, /class="card-arrow"/)
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
})
