const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const pageFile = path.resolve(__dirname, '../pages/works/index.js')
const tap = id => ({ currentTarget: { dataset: { id } } })
const work = (id, extra = {}) => ({ id, name: `作品${id}`, image: `/assets/${id}.jpg`, ...extra })

function environment(t, records, resolveAssets = async () => [], listWorks = () => ({ tasks: [], nextCursor: null })) {
  const originalWx = global.wx
  const stored = new Map([['craftWorks', structuredClone(records)]])
  const modals = [], toasts = [], previews = []
  let writes = 0
  const wx = {
    getStorageSync: key => stored.get(key) || '',
    setStorageSync(key, value) { writes += 1; stored.set(key, value) },
    showModal: options => { modals.push(options) },
    showToast: options => { toasts.push(options) },
    previewImage: options => { previews.push(options) }
  }
  global.wx = wx
  t.after(() => { global.wx = originalWx })
  function load() {
    let definition
    vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
      Page: value => { definition = value }, wx, Date, Promise,
      require: id => id === '../../utils/cloud-service'
        ? { createCloudService: () => ({ resolveAssets, async callAI(action, payload) {
          if (action === 'generation.listWorks') return listWorks(payload)
          if (action === 'generation.deleteWork') return { deleted: true }
          throw new Error('Unexpected test action: ' + action)
        } }) }
        : require(path.resolve(path.dirname(pageFile), id))
    })
    return { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
  }
  return { load, stored, wx, modals, toasts, previews, writes: () => writes }
}

test('the works entry shows every successful generation across pages even when none was manually saved', async t => {
  const task = id => ({ taskId: id, status: 'succeeded', createdAt: 1700000000000, input: { userPrompt: `灵感${id}`, styleId: 'qinghua', styleName: '青花' }, result: { assetId: `asset-${id}`, fileId: `cloud://${id}` } })
  const calls = []
  const env = environment(t, [], async ids => ids.map(assetId => ({ assetId, url: `https://example.com/${assetId}.jpg` })), payload => {
    calls.push(payload)
    return payload.cursor ? { tasks: [task('old')], nextCursor: null } : { tasks: [task('new'), task('middle')], nextCursor: { createdAt: 1700000000000, taskId: 'middle' } }
  })
  const page = env.load()
  await page.onShow()
  assert.equal(calls.length, 2)
  assert.deepEqual(Array.from(page.data.works, item => item.taskId).sort(), ['middle', 'new', 'old'])
  assert.equal(page.data.syncError, false)
  assert.equal(page.data.syncing, false)
  assert.ok(page.data.works.every(item => item.image.startsWith('https://')))
})

test('confirmed deletion removes only the selected work and remains deleted after reopening', async t => {
  const env = environment(t, [work('a'), work('b')])
  env.stored.set('aiGenerationActive', { taskId: 'keep-task' })
  const page = env.load()
  await page.onShow()
  assert.equal(typeof page.deleteWork, 'function', 'Saved work cards need a delete action')
  const deleting = page.deleteWork(tap('a'))
  assert.equal(env.modals.length, 1)
  assert.equal(env.writes(), 0, 'Confirmation must happen before writing')
  env.modals[0].success({ confirm: true })
  await deleting
  assert.deepEqual(Array.from(page.data.works, item => item.id), ['b'])
  assert.deepEqual(env.stored.get('craftWorks').map(item => item.id), ['b'])
  assert.deepEqual(env.stored.get('aiGenerationActive'), { taskId: 'keep-task' })
  const reopened = env.load()
  await reopened.onShow()
  assert.deepEqual(Array.from(reopened.data.works, item => item.id), ['b'])
  const last = reopened.deleteWork(tap('b'))
  env.modals[1].success({ confirm: true })
  await last
  assert.equal(reopened.data.works.length, 0)
  assert.deepEqual(env.stored.get('craftWorks'), [])
})

test('cancel, malformed taps and repeated delete taps cannot remove a work or open duplicate dialogs', async t => {
  const records = [work('a'), work('b')]
  const env = environment(t, records)
  const page = env.load()
  await page.onShow()
  assert.equal(typeof page.deleteWork, 'function')
  await page.deleteWork(null)
  await page.deleteWork(tap('missing'))
  assert.equal(env.modals.length, 0)
  const deleting = page.deleteWork(tap('a'))
  await page.deleteWork(tap('a'))
  await page.deleteWork(tap('b'))
  assert.equal(env.modals.length, 1)
  env.modals[0].success({ cancel: true })
  await deleting
  assert.equal(env.writes(), 0)
  assert.deepEqual(env.stored.get('craftWorks'), records)
  assert.equal(page.data.works.length, 2)
  assert.equal(page.data.deletingId, '')
  assert.equal(env.previews.length, 0)
})

test('a failed storage write keeps the visible and persisted work and permits another attempt', async t => {
  const env = environment(t, [work('a')])
  const page = env.load()
  await page.onShow()
  assert.equal(typeof page.deleteWork, 'function')
  const write = env.wx.setStorageSync
  env.wx.setStorageSync = () => { throw new Error('disk full') }
  const deleting = page.deleteWork(tap('a'))
  env.modals[0].success({ confirm: true })
  await deleting
  assert.equal(page.data.works.length, 1)
  assert.equal(env.stored.get('craftWorks').length, 1)
  assert.ok(env.toasts.some(item => /删除失败/.test(item.title)))
  assert.equal(page.data.deletingId, '')
  env.wx.setStorageSync = write
  const retry = page.deleteWork(tap('a'))
  env.modals[1].success({ confirm: true })
  await retry
  assert.equal(page.data.works.length, 0)
})

test('late image hydration cannot restore deleted records and still resolves remaining images', async t => {
  const pending = []
  const env = environment(t, [work('a', { creationType: 'ai', assetId: 'a' }), work('b', { creationType: 'ai', assetId: 'b' })], () => new Promise(resolve => { pending.push(resolve) }))
  const page = env.load()
  const hydration = page.onShow()
  assert.equal(typeof page.deleteWork, 'function')
  const deleting = page.deleteWork(tap('a'))
  env.modals[0].success({ confirm: true })
  await deleting
  await new Promise(resolve => setImmediate(resolve))
  pending.forEach(finish => finish([{ assetId: 'a', url: 'https://example.com/a.jpg' }, { assetId: 'b', url: 'https://example.com/b.jpg' }]))
  await hydration
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(Array.from(page.data.works, item => item.id), ['b'])
  assert.equal(page.data.works[0].image, 'https://example.com/b.jpg')
  assert.deepEqual(env.stored.get('craftWorks').map(item => item.id), ['b'])
})

test('an image preview waiting for a private link cannot open a work deleted while it waited', async t => {
  let finish, calls = 0
  const env = environment(t, [work('a', { creationType: 'ai', assetId: 'a' })], () => {
    if (++calls === 1) return Promise.resolve([{ assetId: 'a', url: 'https://example.com/a.jpg', expiresAt: Date.now() - 1 }])
    return new Promise(resolve => { finish = resolve })
  })
  const page = env.load()
  await page.onShow()
  assert.equal(typeof page.deleteWork, 'function')
  const preview = page.previewWork(tap('a'))
  const deleting = page.deleteWork(tap('a'))
  env.modals[0].success({ confirm: true })
  await deleting
  finish([{ assetId: 'a', url: 'https://example.com/fresh.jpg', expiresAt: Date.now() + 600000 }])
  await preview
  assert.equal(env.previews.length, 0)
  assert.equal(page.data.works.length, 0)
})

test('confirmation from a previous visit cannot delete records or unlock a newer confirmation', async t => {
  const env = environment(t, [work('a'), work('b')])
  const page = env.load()
  await page.onShow()
  assert.equal(typeof page.deleteWork, 'function')
  const old = page.deleteWork(tap('a'))
  page.onHide()
  await page.onShow()
  const current = page.deleteWork(tap('b'))
  env.modals[0].success({ confirm: true })
  await old
  assert.equal(env.writes(), 0)
  assert.equal(page.data.deletingId, 'b')
  env.modals[1].success({ confirm: true })
  await current
  assert.deepEqual(env.stored.get('craftWorks').map(item => item.id), ['a'])
  assert.equal(page.data.deletingId, '')
})
