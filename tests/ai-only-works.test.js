const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const workViews = require('../utils/ai-work-view')

const source = fs.readFileSync(path.resolve(__dirname, '../pages/works/index.js'), 'utf8')
const digital = { id: 'digital-own', name: '数字青花瓶', creationType: 'digital', image: '/assets/workshop/digital-craft.jpg', createdAt: '2026-10-15' }
const showcase = { id: 'showcase-own', name: '青花展示案例', creationType: 'ai', source: 'showcase', image: '/assets/workshop/ai-creation.jpg', createdAt: '2026-10-15' }
const generated = (id) => ({ id: `ai-${id}`, name: `本人生成${id}`, creationType: 'ai', source: 'generated', taskId: id, assetId: `asset-${id}`, fileId: `cloud://${id}`, image: `cloud://${id}`, createdAt: '2026-10-16' })
const ids = (page) => [...page.data.works].map((item) => item.id)

function environment(local, remote = local) {
  const state = { local: [...local], remote: [...remote], load: null, deleted: [], routes: [], titles: [], modals: [], frames: [] }
  const service = {
    resolveAssets: async (assetIds) => assetIds.map((assetId) => ({ assetId, url: `https://example.test/${assetId}.png`, expiresAt: Date.now() + 600000 }))
  }
  const dependencies = {
    '../../utils/craft-works': { getWorks: () => [...state.local] },
    '../../utils/navigation': { go: (url) => state.routes.push(url) },
    '../../utils/cloud-service': { createCloudService: () => service },
    '../../utils/ai-work-view': workViews,
    '../../utils/work-collection': {
      loadWorkCollection: async () => state.load ? state.load() : [...state.remote],
      deleteWorkRecord: async (work) => {
        state.deleted.push(work.id)
        state.local = state.local.filter((item) => item.id !== work.id)
        state.remote = state.remote.filter((item) => item.id !== work.id)
        return true
      }
    }
  }
  let definition
  vm.runInNewContext(source, {
    require: (name) => { assert.ok(dependencies[name], `Unexpected dependency: ${name}`); return dependencies[name] },
    Page: (value) => { definition = value },
    wx: {
      setNavigationBarTitle: (options) => state.titles.push(options.title),
      showModal: (options) => state.modals.push(options),
      showToast: () => {}
    }
  }, { filename: 'pages/works/index.js' })
  function page(options = {}) {
    const instance = {
      ...definition,
      data: structuredClone(definition.data),
      setData(update) {
        Object.assign(this.data, update)
        if (update.works) state.frames.push([...update.works].map((item) => item.id))
      }
    }
    if (instance.onLoad) instance.onLoad(options)
    return instance
  }
  return { state, page }
}

test('AI work entry filters both the immediate local frame and the complete cloud history', async () => {
  const ai = generated('first')
  const env = environment([digital, showcase, ai])
  let release
  env.state.load = () => new Promise((resolve) => { release = resolve })
  const page = env.page({ type: 'ai' })
  assert.equal(page.data.aiOnly, true)
  const loading = page.onShow()
  assert.deepEqual(ids(page), ['ai-first'])
  release([digital, generated('remote-only'), showcase, ai])
  await loading
  assert.deepEqual(ids(page), ['ai-remote-only', 'ai-first'])
  assert.ok(env.state.frames.every((frame) => frame.every((id) => id.startsWith('ai-'))))
})

test('normal works entry continues to show digital, showcase and generated records together', async () => {
  const env = environment([digital, showcase, generated('first')], [generated('remote-only'), digital, showcase, generated('first')])
  const page = env.page()
  const loading = page.onShow()
  assert.deepEqual(ids(page), ['digital-own', 'showcase-own', 'ai-first'])
  await loading
  assert.deepEqual(ids(page), ['ai-remote-only', 'digital-own', 'showcase-own', 'ai-first'])
  page.startCraft()
  assert.deepEqual(env.state.routes, ['/pages/craft/index?new=1'])
})

test('failed AI cloud synchronization retains only AI records through every fallback frame', async () => {
  const env = environment([digital, showcase, generated('kept')])
  env.state.load = () => { throw new Error('network unavailable') }
  const page = env.page({ type: 'ai' })
  const loading = page.onShow()
  assert.deepEqual(ids(page), ['ai-kept'])
  await loading
  assert.equal(page.data.syncError, true)
  assert.deepEqual(ids(page), ['ai-kept'])
  assert.ok(env.state.frames.every((frame) => frame.every((id) => id.startsWith('ai-'))))
})

test('an empty AI collection uses the AI title and returns to AI creation', async () => {
  const env = environment([digital, showcase])
  const page = env.page({ type: 'ai' })
  await page.onShow()
  assert.deepEqual(ids(page), [])
  assert.deepEqual(env.state.titles, ['AI创瓷作品'])
  page.startCraft()
  assert.deepEqual(env.state.routes, ['/pages/ai-create/index'])
})

test('deleting an AI history record leaves digital and showcase records intact across entries', async () => {
  const env = environment([digital, showcase, generated('remove')])
  const page = env.page({ type: 'ai' })
  await page.onShow()
  assert.deepEqual(ids(page), ['ai-remove'])
  const deletion = page.deleteWork({ currentTarget: { dataset: { id: 'ai-remove' } } })
  assert.equal(env.state.modals.length, 1)
  env.state.modals[0].success({ confirm: true })
  await deletion
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(env.state.deleted, ['ai-remove'])
  assert.deepEqual(env.state.local.map((item) => item.id), ['digital-own', 'showcase-own'])
  assert.deepEqual(env.state.remote.map((item) => item.id), ['digital-own', 'showcase-own'])
  assert.deepEqual(ids(page), [])
  page.onHide()
  const reopenedAI = env.page({ type: 'ai' })
  await reopenedAI.onShow()
  assert.deepEqual(ids(reopenedAI), [])
  const reopenedAll = env.page()
  await reopenedAll.onShow()
  assert.deepEqual(ids(reopenedAll), ['digital-own', 'showcase-own'])
})
