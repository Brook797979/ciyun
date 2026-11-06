const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const expectedIds = ['white', 'sky', 'bean', 'rice', 'cobalt', 'rouge']
const shapes = require('../data/shapes').map(({ id }) => id)
const patterns = require('../data/patterns')

function readCatalog() {
  assert.ok(fs.existsSync(path.join(root, 'data/glazes.js')), 'The glaze catalog must exist')
  return require('../data/glazes')
}

function readResolver() {
  assert.ok(fs.existsSync(path.join(root, 'utils/craft-preview.js')), 'The preview resolver must exist')
  return require('../utils/craft-preview').getCraftPreview
}

test('glaze catalog supplies six named materials and exactly two default choices', () => {
  const glazes = readCatalog()
  assert.deepEqual(glazes.map(({ id, name, shortName, unlocked }) => [id, name, shortName, unlocked]), [
    ['glaze-white', '青花白釉', '白釉', true],
    ['glaze-sky', '天青釉', '天青', true],
    ['glaze-bean', '豆青釉', '豆青', false],
    ['glaze-rice', '暖米釉', '暖米', false],
    ['glaze-cobalt', '霁蓝釉', '霁蓝', false],
    ['glaze-rouge', '胭脂红釉', '胭脂红', false]
  ])
  glazes.forEach((glaze, index) => {
    assert.match(glaze.color, /^#[0-9a-f]{6}$/i)
    assert.ok(glaze.description.length > 0 && glaze.description.length <= 30)
    assert.equal(glaze.image, `/assets/craft/glazes-v1/cards/${expectedIds[index]}.jpg`)
  })
})

test('white glaze resolves every catalog shape-specific pattern preview', () => {
  const getCraftPreview = readResolver()
  shapes.forEach((shape) => patterns.forEach((pattern) => {
    assert.equal(getCraftPreview(shape, pattern.id, 'glaze-white'), pattern.previewImages[shape])
    assert.equal(getCraftPreview(shape, pattern.id), pattern.previewImages[shape])
  }))
})

test('all colored materials resolve to stable paths even while locally locked', () => {
  const getCraftPreview = readResolver()
  shapes.forEach((shape) => patterns.forEach((pattern) => {
    expectedIds.slice(1).forEach((suffix) => {
      assert.equal(getCraftPreview(shape, pattern.id, `glaze-${suffix}`),
        `/assets/craft/glazes-v1/${shape}/${pattern.id.slice(8)}-${suffix}.jpg`)
    })
  }))
})

test('unsupported, malformed and traversal-like IDs never become preview paths', () => {
  const getCraftPreview = readResolver()
  const invalid = [null, '', 0, true, {}, [], ['meiping'], '../../meiping', '__proto__', 'constructor', 'toString']
  invalid.concat(['missing', 'teapot', 'Meiping', ' meiping']).forEach((id) => {
    assert.equal(getCraftPreview(id, 'pattern-lotus', 'glaze-sky'), '')
  })
  invalid.concat([undefined, 'lotus', 'pattern-unknown', 'pattern-lotus/../cloud']).forEach((id) => {
    assert.equal(getCraftPreview('meiping', id, 'glaze-sky'), '')
  })
  invalid.concat(['sky', 'glaze-unknown', 'glaze-sky/../white']).forEach((id) => {
    assert.equal(getCraftPreview('meiping', 'pattern-lotus', id), '')
  })
})

test('all 216 supported combinations and six material cards are present as local assets', () => {
  const getCraftPreview = readResolver()
  const glazes = readCatalog()
  const previews = []
  shapes.forEach((shape) => patterns.forEach((pattern) => glazes.forEach((glaze) => {
    previews.push(getCraftPreview(shape, pattern.id, glaze.id))
  })))
  assert.equal(previews.length, 216)
  assert.equal(new Set(previews).size, 216)
  const missing = previews.concat(glazes.map((glaze) => glaze.image))
    .filter((file) => !fs.existsSync(path.join(root, file.slice(1))))
  assert.deepEqual(missing, [], `Missing craft assets: ${missing.join(', ')}`)
})

test('original generated assets retain background-preserving validation for their colored combinations', () => {
  const manifestPath = path.join(root, 'design-assets/craft/glazes-v1/manifest.json')
  assert.ok(fs.existsSync(manifestPath), 'Generated glaze validation must exist')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.combinationCount, 72)
  assert.equal(manifest.generatedPreviewCount, 60)
  assert.equal(manifest.materialCardCount, 6)
  assert.equal(manifest.validation.backgroundMaxChange255, 0)
  assert.equal(manifest.validation.pigmentCoverageMaxChange255, 0)
  assert.equal(manifest.validation.highlightSupportChangedPixels, 0)
  assert.equal(manifest.validation.checkedColoredCombinations, 60)
  assert.ok(manifest.runtimeBytes < 5 * 1024 * 1024)
  assert.deepEqual(manifest.glazes.map(({ id, color }) => [id, color]),
    readCatalog().map(({ id, color }) => [id, color]))
})
