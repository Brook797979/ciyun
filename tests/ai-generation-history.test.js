const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createService, MemoryRepository } = require('../server/ai')
const { CloudRepository } = require('../server/ai/cloud-repository')

const owner = { OPENID: 'history-owner', APPID: 'history-app' }
const stranger = { OPENID: 'other-owner', APPID: 'history-app' }
const otherApp = { OPENID: 'history-owner', APPID: 'other-app' }
const ownerKey = identity => crypto.createHash('sha256').update(`${identity.APPID}\0${identity.OPENID}`).digest('hex')
function fixture() {
  const repo = new MemoryRepository()
  let sequence = 0
  let calls = 0
  const forbidden = () => { calls++; assert.fail('history and deletion must not call models or storage') }
  const service = createService({ repo, clock: () => 1700000000000, randomId: () => `history-request-${++sequence}`,
    models: { assertConfigured() {}, generate: forbidden, chat: forbidden, identify: forbidden },
    storage: { sign: forbidden, download: forbidden, importImage: forbidden, saveVerified: forbidden }
  })
  const invoke = (action, payload = {}, identity = owner) => service.handle({ version: 1, action, payload }, identity)
  const seed = async (number, overrides = {}, identity = owner) => {
    const id = `task-${String(number).padStart(3, '0')}`
    const row = { id, owner: ownerKey(identity), _openid: identity.OPENID, appid: identity.APPID, kind: 'generation', status: 'succeeded',
      createdAt: 1000000 + number, updatedAt: 1000000 + number,
      input: { userPrompt: `第${number}件瓷器`, styleId: 'qinghua', styleName: '青花' },
      result: { assetId: `asset-${number}`, fileId: `cloud://test.bucket/ciyun/generated/${id}.png` }, ...overrides }
    await repo.set('ai_tasks', row.id, row)
    return row
  }
  return { repo, service, invoke, seed, calls: () => calls }
}
async function allPages(s, identity = owner) {
  const tasks = [], pages = []
  let cursor
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await s.invoke('generation.listWorks', cursor ? { cursor } : {}, identity)
    assert.equal(response.ok, true)
    const page = response.data
    assert.ok(page.tasks.length <= 20)
    pages.push(page)
    tasks.push(...page.tasks)
    if (page.nextCursor === null) return { tasks, pages }
    assert.ok(page.nextCursor && typeof page.nextCursor.createdAt === 'number')
    if (cursor) assert.notDeepEqual(page.nextCursor, cursor, 'cursor must advance even for empty visible pages')
    cursor = page.nextCursor
  }
  assert.fail('pagination must finish')
}

test('lists all 53 successful generated works across pages instead of the newest twenty', async () => {
  const s = fixture()
  for (let index = 1; index <= 53; index++) await s.seed(index)
  const { tasks, pages } = await allPages(s)
  assert.deepEqual(pages.map(page => page.tasks.length), [20, 20, 13])
  assert.deepEqual(tasks.map(task => task.taskId), Array.from({ length: 53 }, (_, index) => `task-${String(53 - index).padStart(3, '0')}`))
  assert.equal(new Set(tasks.map(task => task.taskId)).size, 53)
  assert.equal(s.calls(), 0)
})
test('timestamp ties use descending task ID and never skip or repeat any of 47 records', async () => {
  const s = fixture()
  for (let index = 1; index <= 47; index++) await s.seed(index, { createdAt: 1000000 })
  const { tasks, pages } = await allPages(s)
  assert.equal(tasks.length, 47)
  assert.deepEqual(tasks.map(task => task.taskId), Array.from({ length: 47 }, (_, index) => `task-${String(47 - index).padStart(3, '0')}`))
  assert.deepEqual(pages[0].nextCursor, { createdAt: 1000000, taskId: 'task-028' })
  assert.deepEqual(pages[1].nextCursor, { createdAt: 1000000, taskId: 'task-008' })
})
test('a fully hidden raw page still advances its cursor to the remaining visible history', async () => {
  const s = fixture()
  for (let index = 1; index <= 45; index++) await s.seed(index, index > 25 ? { workDeleted: true, workDeletedAt: 1600000 } : {})
  const { tasks, pages } = await allPages(s)
  assert.deepEqual(pages.map(page => page.tasks.length), [0, 20, 5])
  assert.deepEqual(pages[0].nextCursor, { createdAt: 1000026, taskId: 'task-026' })
  assert.equal(tasks.length, 25)
  assert.ok(tasks.every(task => task.taskId <= 'task-025'))
})
test('missing stable result assets are filtered after raw pagination without truncating later works', async () => {
  const s = fixture()
  for (let index = 1; index <= 24; index++) await s.seed(index, index > 4 ? { result: index % 2 ? {} : { assetId: '' } } : {})
  const { tasks, pages } = await allPages(s)
  assert.equal(pages[0].tasks.length, 0)
  assert.ok(pages[0].nextCursor)
  assert.deepEqual(tasks.map(task => task.taskId), ['task-004', 'task-003', 'task-002', 'task-001'])
})
test('works lists isolate both platform user and app identity, including caller-provided cursors', async () => {
  const s = fixture()
  await s.seed(1)
  await s.seed(2, {}, stranger)
  await s.seed(3, {}, otherApp)
  assert.deepEqual((await allPages(s)).tasks.map(task => task.taskId), ['task-001'])
  assert.deepEqual((await allPages(s, stranger)).tasks.map(task => task.taskId), ['task-002'])
  assert.deepEqual((await allPages(s, otherApp)).tasks.map(task => task.taskId), ['task-003'])
  const page = await s.invoke('generation.listWorks', { cursor: { createdAt: 1000003, taskId: 'task-003' } }, stranger)
  assert.deepEqual(page.data.tasks.map(task => task.taskId), ['task-002'])
  assert.equal((await s.invoke('generation.listWorks', {}, {})).error.code, 'UNAUTHENTICATED')
})
test('rejects malformed cursors before asking the repository for history', async () => {
  const s = fixture()
  for (const cursor of [null, [], {}, 'cursor', { createdAt: '1000000', taskId: 'task-001' }, { createdAt: -1, taskId: 'task-001' },
    { createdAt: 1.5, taskId: 'task-001' }, { createdAt: Infinity, taskId: 'task-001' }, { createdAt: NaN, taskId: 'task-001' },
    { createdAt: Number.MAX_SAFE_INTEGER + 1, taskId: 'task-001' }, { createdAt: 1000000 }, { createdAt: 1000000, taskId: '../secret' },
    { createdAt: 1000000, taskId: '' }, { createdAt: 1000000, taskId: 'a'.repeat(129) }]) {
    assert.equal((await s.invoke('generation.listWorks', { cursor })).error?.code, 'INVALID_INPUT', JSON.stringify(cursor))
  }
})
test('only succeeded generation tasks with stable asset identities are exposed', async () => {
  const s = fixture()
  await s.seed(1)
  for (const [index, status] of ['queued', 'running', 'storing', 'failed', 'unknown'].entries()) await s.seed(index + 2, { status })
  await s.seed(10, { kind: 'chat' })
  await s.seed(11, { kind: 'identify' })
  await s.seed(12, { result: { assetId: 'not/a/stable/id' } })
  const { tasks } = await allPages(s)
  assert.deepEqual(tasks.map(task => task.taskId), ['task-001'])
  assert.equal(tasks[0].status, 'succeeded')
  assert.equal(tasks[0].input.styleName, '青花')
  assert.equal(tasks[0].result.assetId, 'asset-1')
})
test('an exact twenty-row final page has no misleading continuation cursor', async () => {
  const s = fixture()
  for (let index = 1; index <= 20; index++) await s.seed(index)
  const { pages } = await allPages(s)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].nextCursor, null)
})
test('inserting a newer work between pages cannot duplicate or skip the original older records', async () => {
  const s = fixture()
  for (let index = 1; index <= 43; index++) await s.seed(index, { createdAt: 1000000 + Math.floor(index / 3) })
  const first = await s.invoke('generation.listWorks')
  assert.equal(first.ok, true)
  await s.seed(100, { createdAt: 2000000 })
  const collected = [...first.data.tasks]
  let cursor = first.data.nextCursor
  while (cursor) { const page = await s.invoke('generation.listWorks', { cursor }); assert.equal(page.ok, true); collected.push(...page.data.tasks); cursor = page.data.nextCursor }
  assert.equal(collected.length, 43)
  assert.equal(new Set(collected.map(task => task.taskId)).size, 43)
  assert.ok(collected.every(task => task.taskId !== 'task-100'))
})
test('deletion is idempotent and preserves task reads, creation idempotency and stored image assets', async () => {
  const s = fixture()
  const input = { clientRequestId: 'preserve-generated-task', userPrompt: '青花莲纹梅瓶', styleId: 'qinghua' }
  const created = await s.invoke('generation.create', input)
  const taskId = created.data.taskId
  const row = await s.repo.get('ai_tasks', taskId)
  const result = { assetId: 'stable-generated-asset', fileId: 'cloud://test.bucket/ciyun/generated/kept.png' }
  await s.repo.set('ai_tasks', taskId, { ...row, status: 'succeeded', result })
  const asset = { id: result.assetId, owner: row.owner, status: 'ready', fileId: result.fileId }
  await s.repo.set('assets', asset.id, asset)
  const before = await s.invoke('generation.get', { taskId })
  assert.deepEqual((await s.invoke('generation.deleteWork', { taskId })).data, { deleted: true })
  const firstDelete = await s.repo.get('ai_tasks', taskId)
  assert.equal(firstDelete.workDeleted, true)
  assert.equal(firstDelete.workDeletedAt, 1700000000000)
  assert.deepEqual((await s.invoke('generation.deleteWork', { taskId })).data, { deleted: true })
  assert.deepEqual(await s.repo.get('ai_tasks', taskId), firstDelete)
  assert.deepEqual((await s.invoke('generation.get', { taskId })).data, before.data)
  assert.deepEqual((await s.invoke('generation.create', input)).data, before.data)
  assert.deepEqual(await s.repo.get('assets', asset.id), asset)
  assert.deepEqual((await s.invoke('generation.listWorks')).data, { tasks: [], nextCursor: null })
  assert.equal((await s.invoke('generation.findRecent')).data.tasks[0].taskId, taskId)
  assert.equal(s.calls(), 0)
})
test('delete rejects other owners, missing tasks and tasks outside succeeded generation', async () => {
  const s = fixture()
  await s.seed(1)
  assert.equal((await s.invoke('generation.deleteWork', { taskId: 'task-001' }, stranger)).error?.code, 'NOT_FOUND')
  assert.equal((await s.invoke('generation.deleteWork', { taskId: 'missing' })).error?.code, 'NOT_FOUND')
  for (const [index, patch] of [{ kind: 'chat' }, { kind: 'identify' }, { status: 'queued' }, { status: 'failed' }].entries()) {
    const row = await s.seed(index + 2, patch)
    assert.equal((await s.invoke('generation.deleteWork', { taskId: row.id })).error?.code, 'NOT_FOUND')
    assert.equal((await s.repo.get('ai_tasks', row.id)).workDeleted, undefined)
  }
  assert.equal((await s.invoke('generation.deleteWork', { taskId: '../secret' })).error?.code, 'INVALID_INPUT')
})

function matches(row, query) {
  if (query.and) return query.and.every(item => matches(row, item))
  if (query.or) return query.or.some(item => matches(row, item))
  return Object.entries(query).every(([key, expected]) => expected && typeof expected === 'object' && Object.hasOwn(expected, 'lt') ? row[key] < expected.lt : row[key] === expected)
}
test('CloudRepository applies ownership and lexicographic keyset filters before both database sort keys and limit', async () => {
  const log = []
  const rows = [
    { id: 'task-009', owner: 'mine', kind: 'generation', status: 'succeeded', createdAt: 100 },
    { id: 'task-008', owner: 'mine', kind: 'generation', status: 'succeeded', createdAt: 100 },
    { id: 'task-007', owner: 'mine', kind: 'generation', status: 'succeeded', createdAt: 100 },
    { id: 'task-010', owner: 'mine', kind: 'generation', status: 'succeeded', createdAt: 99 },
    { id: 'other-owner', owner: 'other', kind: 'generation', status: 'succeeded', createdAt: 90 },
    { id: 'other-kind', owner: 'mine', kind: 'chat', status: 'succeeded', createdAt: 80 }
  ]
  let criteria, maximum
  const sorts = []
  const query = {
    where(filter) { criteria = filter; log.push('where'); return this },
    orderBy(field, direction) { sorts.push([field, direction]); log.push('orderBy'); return this },
    limit(limit) { maximum = limit; log.push('limit'); return this },
    async get() {
      log.push('get')
      const data = rows.filter(row => matches(row, criteria)).sort((a, b) => {
        for (const [field, direction] of sorts) { if (a[field] !== b[field]) return (a[field] > b[field] ? 1 : -1) * (direction === 'desc' ? -1 : 1) }
        return 0
      }).slice(0, maximum)
      return { data }
    }
  }
  const repo = new CloudRepository({ command: { lt: value => ({ lt: value }), and: values => ({ and: values }), or: values => ({ or: values }) }, collection(name) { assert.equal(name, 'ai_tasks'); return query } })
  assert.equal(typeof repo.listGenerationWorks, 'function')
  const result = await repo.listGenerationWorks('mine', { createdAt: 100, taskId: 'task-008' }, 21)
  assert.deepEqual(result.map(row => row.id), ['task-007', 'task-010'])
  assert.deepEqual(sorts, [['createdAt', 'desc'], ['id', 'desc']])
  assert.equal(maximum, 21)
  assert.ok(log.indexOf('where') < log.indexOf('limit'))
  assert.equal(log.at(-1), 'get')
})
