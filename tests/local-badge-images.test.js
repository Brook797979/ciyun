const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const root = path.resolve(__dirname, '..')

test('chapter and profile artwork use actual PNGs accepted by the phone upload image whitelist', () => {
  const chapters = require('../data/chapter-badges')
  const growth = require('../data/growth')
  const sources = new Set([
    ...chapters.flatMap(badge => [badge.badgeImageLocked, badge.badgeImageUnlocked]),
    ...growth.badges.map(badge => badge.image), growth.identityImage
  ])
  assert.equal(sources.size, 10)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  for (const source of sources) {
    assert.equal(path.extname(source), '.png', `${source} must use the PNG type accepted in phone packages`)
    const relative = source.slice(1)
    assert.equal(config.packOptions.ignore.some(rule => relative === rule.value || rule.type === 'folder' && relative.startsWith(rule.value + '/')), false, `${source} must stay inside the phone package`)
    const bytes = fs.readFileSync(path.join(root, relative))
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], 'renaming a WebP is not a PNG conversion')
  }
})

test('profile static footprint and journal image paths share the compatible badge format', () => {
  for (const file of ['pages/profile/index.js', 'pages/profile/index.wxml', 'pages/ai-chat/index.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /\/assets\/(?:profile|ai-chat)\/[^'"`\s]*\.webp/, `${file} must not leave an unshipped WebP in a secondary image slot`)
  }
})
