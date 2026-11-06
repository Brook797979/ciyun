const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const file = path.resolve(__dirname, '../utils/work-collection.js')
const epoch = Date.parse('2026-10-01T00:00:00Z')
function task(index = 1) {
  return { taskId: `task-${index}`, status: 'succeeded', input: { userPrompt: '设计一只瓷瓶，以月下荷塘为主题', styleId: 'qinghua', styleName: '青花' }, result: { assetId: `asset-${index}`, fileId: `cloud://file-${index}` }, createdAt: epoch + index * 1000 }
}
function saved(id, extra = {}) { return { id, name: `作品${id}`, image: '/local.jpg', ...extra } }
function environment(t, works = []) {
  const previousWx = global.wx
  const values = new Map([['craftWorks', works]])
  const writes = []
  global.wx = {
    getStorageSync(key) { return values.has(key) ? values.get(key) : '' },
    setStorageSync(key, value) { writes.push({ key, value }); values.set(key, value) }
  }
  t.after(() => { global.wx = previousWx; delete require.cache[file] })
  return { values, writes }
}
function api() {
  assert.ok(fs.existsSync(file), 'A shared complete work collection is required')
  delete require.cache[file]
  return require(file)
}

test('all cloud successes are paged beyond twenty and mapped without requiring manual save', async (t) => {
  const { writes } = environment(t)
  const { loadWorkCollection } = api()
  const tasks = Array.from({ length: 45 }, (_, index) => task(index))
  delete tasks[44].result.fileId
  const cursors = [{ createdAt: tasks[19].createdAt, taskId: tasks[19].taskId }, { createdAt: tasks[39].createdAt, taskId: tasks[39].taskId }]
  const requests = []
  const service = { async callAI(action, payload) {
    assert.equal(action, 'generation.listWorks')
    const index = requests.length
    requests.push(payload)
    return { tasks: tasks.slice(index * 20, index * 20 + 20), nextCursor: cursors[index] || null }
  } }
  const works = await loadWorkCollection(service)
  assert.equal(works.length, 45)
  assert.deepEqual(requests, [{}, { cursor: cursors[0] }, { cursor: cursors[1] }])
  const first = works.find(work => work.taskId === 'task-0')
  assert.equal(first.id, 'ai-task-0')
  assert.equal(first.creationType, 'ai')
  assert.equal(first.source, 'generated')
  assert.equal(first.assetId, 'asset-0')
  assert.equal(first.fileId, 'cloud://file-0')
  assert.equal(first.image, 'cloud://file-0')
  assert.deepEqual(first.input, tasks[0].input)
  assert.equal(first.userPrompt, tasks[0].input.userPrompt)
  assert.equal(first.styleId, 'qinghua')
  assert.equal(first.styleName, '青花')
  assert.match(first.name, /青花|月下荷塘/)
  assert.equal(first.createdAt, new Date(tasks[0].createdAt).toISOString())
  assert.equal(works.find(work => work.taskId === 'task-44').image, 'asset:asset-44')
  assert.deepEqual(writes, [], 'Loading a directory must not save every cloud image locally')
})

test('an empty filtered page with a next cursor continues instead of truncating the directory', async (t) => {
  environment(t)
  const { loadWorkCollection } = api()
  const cursorA = { createdAt: epoch, taskId: 'scan-a' }
  const cursorB = { createdAt: epoch - 1, taskId: 'scan-b' }
  const pages = [{ tasks: [task(1)], nextCursor: cursorA }, { tasks: [], nextCursor: cursorB }, { tasks: [task(2)], nextCursor: null }]
  const requests = []
  const works = await loadWorkCollection({ async callAI(action, payload) { requests.push(payload); return pages.shift() } })
  assert.deepEqual(new Set(works.map(work => work.taskId)), new Set(['task-1', 'task-2']))
  assert.deepEqual(requests, [{}, { cursor: cursorA }, { cursor: cursorB }])
})

test('manual metadata wins while the complete cloud directory controls saved AI membership', async (t) => {
  const local = [
    saved('digital', { creationType: 'digital', taskId: 'unrelated', shapeId: 'meiping' }),
    saved('showcase-case', { creationType: 'ai', source: 'showcase', caseId: 'case' }),
    saved('ai-task-1', { taskId: 'task-1', creationType: 'ai', name: '我取的名字', note: { keep: true }, createdAt: '2026-09-02T00:00:00.000Z' }),
    saved('ai-task-deleted', { taskId: 'task-deleted', creationType: 'ai' }),
    saved('legacy-ai', { creationType: 'ai', source: 'generated', legacy: true })
  ]
  const { values, writes } = environment(t, local)
  const { loadWorkCollection } = api()
  const works = await loadWorkCollection({ async callAI() { return { tasks: [task(1), task(1), { ...task(2), status: 'failed' }], nextCursor: null } } })
  assert.equal(works.length, 4)
  const combined = works.find(work => work.taskId === 'task-1')
  assert.equal(combined.name, '我取的名字')
  assert.deepEqual(combined.note, { keep: true })
  assert.equal(combined.createdAt, local[2].createdAt)
  assert.equal(combined.assetId, 'asset-1')
  assert.equal(works.some(work => work.taskId === 'task-deleted'), false)
  for (const id of ['digital', 'showcase-case', 'legacy-ai']) assert.ok(works.some(work => work.id === id))
  assert.equal(values.get('craftWorks'), local)
  assert.deepEqual(writes, [])
})

test('a later page failure rejects rather than treating a partial directory as authoritative', async (t) => {
  const original = [saved('ai-task-1', { taskId: 'task-1', creationType: 'ai' })]
  const { values, writes } = environment(t, original)
  const { loadWorkCollection } = api()
  const failure = new Error('next page unavailable')
  let calls = 0
  await assert.rejects(loadWorkCollection({ async callAI() {
    calls += 1
    if (calls === 1) return { tasks: [task(2)], nextCursor: { createdAt: epoch, taskId: 'next' } }
    throw failure
  } }), error => error === failure)
  assert.equal(values.get('craftWorks'), original)
  assert.deepEqual(writes, [])
})

test('real AI deletion commits remotely before deleting local copies and stays deleted on a fresh directory read', async (t) => {
  const original = saved('ai-task-1', { taskId: 'task-1', creationType: 'ai', assetId: 'asset-1', fileId: 'cloud://file-1' })
  const { values } = environment(t, [original])
  const { loadWorkCollection, deleteWorkRecord } = api()
  let deleted = false
  const requests = []
  const service = { async callAI(action, payload) {
    requests.push({ action, payload })
    if (action === 'generation.deleteWork') {
      assert.equal(values.get('craftWorks').length, 1, 'A cloud failure must not lose the local copy')
      assert.deepEqual(payload, { taskId: 'task-1' })
      deleted = true
      return { deleted: true }
    }
    assert.equal(action, 'generation.listWorks')
    return { tasks: deleted ? [] : [task(1)], nextCursor: null }
  } }
  assert.equal(await deleteWorkRecord(original, service), true)
  assert.deepEqual(values.get('craftWorks'), [])
  assert.deepEqual(await loadWorkCollection(service), [])
  assert.deepEqual(requests.map(request => request.action), ['generation.deleteWork', 'generation.listWorks'])
})

test('cloud-only work deletion infers its task id and succeeds even without a local save', async (t) => {
  const { writes } = environment(t)
  const { deleteWorkRecord } = api()
  const calls = []
  assert.equal(await deleteWorkRecord(saved('ai-task-8', { creationType: 'ai' }), { async callAI(action, payload) { calls.push({ action, payload }); return {} } }), true)
  assert.deepEqual(calls, [{ action: 'generation.deleteWork', payload: { taskId: 'task-8' } }])
  assert.deepEqual(writes, [])
})

test('remote deletion failure leaves local names and metadata untouched', async (t) => {
  const original = [saved('ai-task-1', { taskId: 'task-1', creationType: 'ai', name: '保留我的名字' })]
  const { values, writes } = environment(t, original)
  const { deleteWorkRecord } = api()
  const failure = new Error('delete unavailable')
  await assert.rejects(deleteWorkRecord(original[0], { async callAI() { throw failure } }), error => error === failure)
  assert.equal(values.get('craftWorks'), original)
  assert.deepEqual(writes, [])
})

test('digital works and showcase copies are removed only from local storage', async (t) => {
  const digital = saved('digital', { creationType: 'digital', taskId: 'unrelated' })
  const showcase = saved('showcase-case', { creationType: 'ai', source: 'showcase', taskId: 'case-task' })
  const { values } = environment(t, [digital, showcase])
  const { deleteWorkRecord } = api()
  const service = { callAI() { assert.fail('Local artwork deletion must not touch cloud tasks or images') } }
  assert.equal(await deleteWorkRecord(digital, service), true)
  assert.equal(await deleteWorkRecord(showcase, service), true)
  assert.deepEqual(values.get('craftWorks'), [])
})

test('a late in-flight listing cannot revive deletion while a genuinely new load queries the current directory', async (t) => {
  environment(t)
  const { loadWorkCollection, deleteWorkRecord } = api()
  let finishOldList
  let lists = 0
  const service = { async callAI(action) {
    if (action === 'generation.deleteWork') return {}
    lists += 1
    if (lists === 1) return new Promise(resolve => { finishOldList = resolve })
    return { tasks: [task(1)], nextCursor: null }
  } }
  const oldLoad = loadWorkCollection(service)
  await deleteWorkRecord(saved('ai-task-1', { taskId: 'task-1', creationType: 'ai' }), service)
  const currentLoad = await loadWorkCollection(service)
  assert.equal(currentLoad.length, 1, 'A newer server directory must not be blocked forever by an old client tombstone')
  finishOldList({ tasks: [task(1)], nextCursor: null })
  assert.deepEqual(await oldLoad, [], 'Starting another load must not reset protection for the older request')
  assert.equal(lists, 2)
})

test('metadata is read after remote pagination so a rename made during loading is retained', async (t) => {
  const { values } = environment(t)
  const { loadWorkCollection } = api()
  let finish
  const pending = loadWorkCollection({ callAI() { return new Promise(resolve => { finish = resolve }) } })
  values.set('craftWorks', [saved('ai-task-1', { taskId: 'task-1', creationType: 'ai', name: '刚刚改好的名字' })])
  finish({ tasks: [task(1)], nextCursor: null })
  assert.equal((await pending)[0].name, '刚刚改好的名字')
})
