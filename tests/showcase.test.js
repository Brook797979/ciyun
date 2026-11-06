const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')

test('five style cases are explicit showcase records with usable local artwork', () => {
  const file = path.join(root, 'data/showcase.js')
  assert.ok(fs.existsSync(file), 'showcase catalog is available to all AI pages')
  const catalog = require(file)
  assert.equal(catalog.generationCases.length, 5)
  assert.deepEqual(new Set(catalog.generationCases.map(item => item.styleId)), new Set(['qinghua','fencai','monochrome','ink','antique']))
  assert.equal(new Set(catalog.generationCases.map(item => item.id)).size, 5)
  for (const item of catalog.generationCases) {
    assert.equal(item.source, 'showcase')
    assert.ok(item.name && item.prompt && item.styleName)
    assert.ok(fs.existsSync(path.join(root, item.image.replace(/^\//, ''))))
    assert.equal(catalog.findGenerationCase(item.id).id, item.id)
  }
  assert.equal(catalog.findGenerationCase('not-a-real-case'), null)
})

test('identification and guide examples remain clearly separate from real requests', () => {
  const file = path.join(root, 'data/showcase.js')
  assert.ok(fs.existsSync(file), 'showcase catalog exists')
  const catalog = require(file)
  assert.equal(catalog.identificationCases.length, 3)
  for (const item of catalog.identificationCases) {
    assert.equal(item.source, 'showcase')
    assert.ok(item.result.observations.length)
    assert.ok(fs.existsSync(path.join(root, item.image.replace(/^\//, ''))))
  }
  assert.ok(catalog.chatCases.length)
  assert.ok(catalog.chatCases.every(item => item.source === 'showcase' && item.question && item.answer))
})
