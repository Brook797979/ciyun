const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

function harness(t) {
  const previousWx = global.wx; const previousPage = global.Page
  let saved = { completedLevelIds: ['level-001', 'level-002'] }; let unreadable = false; let page; const writes = []
  global.wx = {
    getStorageSync() { if (unreadable) throw new Error('unreadable'); return structuredClone(saved) },
    setStorageSync(...args) { writes.push(args) }
  }
  global.Page = definition => { page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } } }
  const source = path.resolve(__dirname, '../pages/challenge/index.js')
  delete require.cache[require.resolve(source)]; require(source)
  global.Page = previousPage
  t.after(() => { global.wx = previousWx; global.Page = previousPage })
  return { page, writes, save: value => { saved = value }, failRead: () => { unreadable = true } }
}

test('opening chapter badges refreshes saved completions without granting progress or other rewards', t => {
  const { page, save, writes } = harness(t)
  page.onShow(); assert.equal(page.data.badges[0].completedCount, 2)
  save({ completedLevelIds: ['level-001', 'level-002', 'level-003', 'level-004', 'level-005'] })
  page.openAchievement()
  assert.equal(page.data.showAchievement, true)
  assert.equal(page.data.badges[0].completedCount, 4); assert.equal(page.data.badges[0].unlocked, true)
  assert.equal(page.data.badges[1].completedCount, 1); assert.equal(page.data.badges[1].unlocked, false)
  assert.equal(page.data.unlockedBadgeCount, 1); assert.equal(page.data.badges.length, 3)
  assert.deepEqual(writes, [])
})

test('unreadable progress still opens the modal with the last readable badge state', t => {
  const { page, failRead, writes } = harness(t)
  page.onShow(); const badges = structuredClone(page.data.badges); failRead()
  assert.doesNotThrow(() => page.openAchievement())
  assert.equal(page.data.showAchievement, true); assert.deepEqual(page.data.badges, badges)
  page.closeAchievement(); assert.equal(page.data.showAchievement, false)
  page.openAchievement(); page.onHide(); assert.equal(page.data.showAchievement, false)
  assert.deepEqual(writes, [])
})
