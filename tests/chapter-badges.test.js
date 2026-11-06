const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const badgePath = path.join(root, 'data/chapter-badges.js')

function loadBadges() {
  assert.ok(fs.existsSync(badgePath), 'chapter badges must have a separate configuration module')
  return require(badgePath)
}

test('chapter badge configuration supplies exactly three ordered chapter identities and artwork paths', () => {
  const badges = loadBadges()
  assert.equal(badges.length, 3)
  assert.equal(new Set(badges.map(({ id }) => id)).size, 3)
  assert.deepEqual(badges.map(({ id, chapterId, title, chapterName, totalLevels }) => (
    [id, chapterId, title, chapterName, totalLevels]
  )), [
    ['badge-chapter-1', 'chapter-1', '第一章徽章', '溪畔识瓷', 4],
    ['badge-chapter-2', 'chapter-2', '第二章徽章', '青花作坊', 4],
    ['badge-chapter-3', 'chapter-3', '第三章徽章', '窑火成器', 4]
  ])
  badges.forEach((badge, index) => {
    const image = `/assets/challenge/badges/chapter-${index + 1}.png`
    assert.equal(badge.badgeImageLocked, image)
    assert.equal(badge.badgeImageUnlocked, image)
    assert.ok(fs.existsSync(path.join(root, image.slice(1))), `local badge artwork must exist: ${image}`)
    for (const key of ['finishedLevels', 'completedCount', 'totalCount', 'progressPercent', 'unlocked']) {
      assert.equal(Object.hasOwn(badge, key), false, `static badges must not supply ${key}`)
    }
  })
})

test('challenge map preserves badge metadata and legacy aliases without changing the configuration', () => {
  const badges = loadBadges()
  const before = structuredClone(badges)
  const map = require(path.join(root, 'data/challenge-map'))
  assert.equal(map.badges.length, badges.length)
  map.badges.forEach((badge, index) => {
    assert.deepEqual(badge, {
      ...badges[index],
      name: badges[index].title,
      description: `完成「${badges[index].chapterName}」全部关卡后解锁。`,
      image: badges[index].badgeImageUnlocked
    })
    assert.notEqual(badge, badges[index])
  })
  assert.deepEqual(badges, before)
})
