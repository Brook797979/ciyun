const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const manifest = require('../utils/static-media-manifest.json')

function nativeRuntime(savedWorks = []) {
  const modules = new Map()
  const storage = new Map([['craftWorks', savedWorks]])
  const calls = []
  let definition
  const context = vm.createContext({
    App() {},
    Page(value) { definition = value },
    wx: {
      getStorageSync: key => storage.has(key) ? storage.get(key) : '',
      setStorageSync: (key, value) => storage.set(key, value),
      showToast() {},
      cloud: {
        init() {},
        callFunction(options) {
          calls.push(options.data.action)
          assert.equal(options.data.action, 'generation.listWorks', 'showcase images never request private AI assets')
          return Promise.resolve({ result: { ok: true, data: { tasks: [] } } })
        }
      }
    }
  })
  function load(file) {
    const absolute = path.resolve(root, file)
    if (modules.has(absolute)) return modules.get(absolute).exports
    const module = { exports: {} }
    modules.set(absolute, module)
    const requireJs = request => {
      assert.ok(request.startsWith('.'), 'native client dependencies use relative JS modules')
      return load(path.resolve(path.dirname(absolute), request.endsWith('.js') ? request : request + '.js'))
    }
    const source = fs.readFileSync(absolute, 'utf8')
    const initialize = vm.runInContext(`(function(require, module, exports) {\n${source}\n})`, context, { filename: absolute })
    initialize(requireJs, module, module.exports)
    return module.exports
  }
  load('app.js')
  return {
    load, storage, calls,
    page(file, options) {
      load(file)
      const page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
      page.onLoad(options)
      return page
    }
  }
}

test('native result onLoad resolves all five showcase case images to hosted HTTPS URLs', () => {
  const runtime = nativeRuntime()
  const cases = runtime.load('data/showcase.js').generationCases
  assert.equal(cases.length, 5)
  for (const example of cases) {
    const page = runtime.page('pages/ai-result/index.js', { caseId: example.id })
    assert.equal(page.data.isShowcase, true)
    assert.equal(page.data.status, 'succeeded')
    assert.equal(page.data.image, manifest.cloudRoot + example.image, example.id)
    assert.equal(page.data.caseId, example.id)
    assert.equal(page.data.userPrompt, example.prompt)
  }
  assert.equal(runtime.calls.length, 0)
})

test('saving a hosted showcase result preserves its case identity and resolved image', async () => {
  const runtime = nativeRuntime()
  const cases = runtime.load('data/showcase.js').generationCases
  for (const example of cases) {
    const page = runtime.page('pages/ai-result/index.js', { caseId: example.id })
    await page.saveArtwork()
    const saved = runtime.storage.get('craftWorks').find(work => work.caseId === example.id)
    assert.ok(saved, example.id)
    assert.equal(saved.image, manifest.cloudRoot + example.image, example.id)
    assert.equal(saved.source, 'showcase')
    assert.equal(saved.id, `showcase-${example.id}`)
    assert.equal(saved.userPrompt, example.prompt)
    assert.equal(saved.styleId, example.styleId)
    assert.equal(saved.assetId, undefined)
  }
  assert.equal(runtime.calls.length, 0)
})

test('works page hydrates previously saved local showcase paths without changing local history', async () => {
  const examples = require('../data/showcase').generationCases
  const history = examples.map(example => ({
    id: `showcase-${example.id}`, name: example.name, caseId: example.id,
    creationType: 'ai', source: 'showcase', image: example.image, createdAt: example.createdAt
  }))
  const runtime = nativeRuntime(history)
  const page = runtime.page('pages/works/index.js', {})
  const refresh = page.onShow()
  for (const work of page.data.works) {
    assert.equal(work.image, manifest.cloudRoot + examples.find(example => example.id === work.caseId).image)
  }
  await refresh
  for (const work of page.data.works) {
    assert.equal(work.image, manifest.cloudRoot + examples.find(example => example.id === work.caseId).image)
    assert.equal(work.creationLabel, '展示案例')
    assert.equal(work.imageUnavailable, false)
  }
  assert.equal(page.data.works.length, 5)
  assert.equal(runtime.calls.join(','), 'generation.listWorks')
  assert.equal(runtime.storage.get('craftWorks')[0].image, history[0].image)
  assert.match(runtime.storage.get('craftWorks')[0].image, /^\/assets\/ai-showcase\//)
})
