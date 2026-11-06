const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const root = path.resolve(__dirname, '..')
const badges = ['master', 'craft', 'creator', 'identify', 'scholar', 'inquiry'].map((id, i) => ({ id, name: ['瓷境宗师', '匠心巧手', '灵感造物师', '慧眼识珍', '博古知瓷', '问瓷求真'][i], condition: '完成真实体验后解锁', image: `/assets/profile/${id}.png`, target: 1 }))
const initial = () => ({ identity: { level: 2, title: '青瓷研习者', totalXp: 68, currentLevelXp: 50, nextLevelXp: 150, progressPercent: 18, exploredDays: 3 }, footprints: { completedLevels: 2, ownWorks: 1, unlockedBadges: 1 }, badges: badges.map((badge, i) => ({ ...badge, unlocked: i === 1, current: i === 1 ? 1 : 0, progressPercent: i === 1 ? 100 : 0 })), journal: [{ id: 'work-1', title: '保存作品《青花碗》', createdAt: 1000, dateLabel: '10.17', iconType: 'work' }] })
function harness() {
  let definition; let state = initial(); let failing = false; let warnings = []; const actions = []; const routes = []; const scrolls = []
  const growth = { recordVisit() { actions.push('visit') }, migrateExistingRecords() { actions.push('migrate'); return { migrationWarnings: warnings.slice() } }, getProfileState() { actions.push('read'); if (failing) throw new Error('unreadable'); return structuredClone(state) } }
  const wx = { getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 44 }), getMenuButtonBoundingClientRect: () => ({ top: 52, height: 32 }), pageScrollTo: value => scrolls.push(value) }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/profile/index.js'), 'utf8'), { wx, Page(value) { definition = value }, require(id) {
    if (id === '../../utils/growth-progress') return { createGrowthProgress: () => growth }
    if (id === '../../data/growth') return { badges }
    if (id === '../../utils/navigation') return { go: route => routes.push(route) }
    return require(path.resolve(root, 'pages/profile', id))
  } })
  const page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
  return { page, actions, routes, scrolls, change: value => { state = value }, fail: value => { failing = value }, warn: value => { warnings = value } }
}
const tap = (key, value) => ({ currentTarget: { dataset: { [key]: value } } })

test('profile refreshes real growth, footprints, badges and journal with capsule-safe navigation', () => {
  const { page, actions } = harness(); page.onLoad(); page.onShow()
  assert.deepEqual(actions, ['visit', 'migrate', 'read'])
  assert.equal(page.data.identity.totalXp, 68); assert.equal(page.data.footprints.ownWorks, 1)
  assert.equal(page.data.badges.length, 6); assert.equal(page.data.journal[0].id, 'work-1')
  assert.ok(page.data.heroHeight >= 84); assert.ok(page.data.modalTop >= 92)
})

test('unreadable growth preserves the last readable profile and a later retry refreshes it', () => {
  const { page, fail, change } = harness(); page.onLoad(); page.onShow()
  const before = structuredClone(page.data.identity); fail(true); page.refreshProfile()
  assert.deepEqual(structuredClone(page.data.identity), before); assert.ok(page.data.profileWarning)
  fail(false); const newer = initial(); newer.identity.totalXp = 83; change(newer); page.refreshProfile()
  assert.equal(page.data.identity.totalXp, 83); assert.equal(page.data.profileWarning, '')
})

test('growth badge dialog only opens configured badges and clears when leaving', () => {
  const { page } = harness(); page.onLoad(); page.onShow()
  for (const event of [undefined, {}, tap('id', 'unknown')]) page.openBadge(event)
  assert.equal(page.data.selectedBadge, null)
  page.openBadge(tap('id', 'craft')); assert.equal(page.data.selectedBadge.id, 'craft'); assert.equal(page.data.selectedBadge.unlocked, true)
  page.closeBadge(); assert.equal(page.data.selectedBadge, null)
  page.openBadge(tap('id', 'identify')); page.onHide(); assert.equal(page.data.selectedBadge, null)
})

test('partial source migration warnings remain visible until a successful retry', () => {
  const { page, warn } = harness(); page.onLoad(); warn(['identify']); page.onShow()
  assert.ok(page.data.profileWarning); assert.equal(page.data.identity.totalXp, 68)
  warn([]); page.refreshProfile(); assert.equal(page.data.profileWarning, '')
})

test('footprint actions only navigate to known destinations or the growth section', () => {
  const { page, routes, scrolls } = harness(); page.onLoad()
  page.openFootprint(tap('kind', 'levels')); page.openFootprint(tap('kind', 'works')); page.openFootprint(tap('kind', 'badges'))
  for (const event of [undefined, {}, tap('kind', 'https://untrusted.test'), tap('url', '/pages/works/index')]) page.openFootprint(event)
  assert.deepEqual(routes, ['/pages/challenge/index', '/pages/works/index'])
  assert.equal(scrolls.length, 1); assert.equal(scrolls[0].selector, '#growth-badges')
})
