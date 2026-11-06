const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const catalogFile = path.join(root, 'data/challenge-games.js')
const levelsFile = path.join(root, 'games/data/levels.js')
const expected = {
  'level-001': { mode: 'match', title: '纹样消消乐' },
  'level-002': { mode: 'link', title: '瓷纹连连看' },
  'level-003': { mode: 'puzzle', title: '古瓷拼图' },
  'level-004': { mode: 'shape', title: '瓷器辨形' },
  'level-005': { mode: 'quiz', title: '瓷识小问答' },
  'level-006': { mode: 'match', title: '纹样消消乐' },
  'level-007': { mode: 'puzzle', title: '古瓷拼图' },
  'level-008': { mode: 'shape', title: '瓷器辨形' },
  'level-009': { mode: 'link', title: '瓷纹连连看' },
  'level-010': { mode: 'quiz', title: '瓷识小问答' },
  'level-011': { mode: 'match', title: '纹样消消乐' },
  'level-012': { mode: 'puzzle', title: '古瓷拼图' }
}

function loadCatalog() {
  assert.ok(fs.existsSync(catalogFile), 'the main package has a shared game catalog')
  return require(catalogFile)
}

test('the shared game catalog describes the current twelve challenge games', () => {
  assert.deepEqual(loadCatalog(), expected)
})

test('game levels take their mode and title from the shared catalog', () => {
  const catalog = loadCatalog()
  const levels = require(levelsFile)
  assert.deepEqual(Object.keys(levels), Object.keys(catalog))
  for (const [id, metadata] of Object.entries(catalog)) {
    assert.deepEqual({ mode: levels[id].mode, title: levels[id].title }, metadata)
  }

  const changedCatalog = Object.fromEntries(Object.keys(catalog).map(id => [id, {
    mode: `mode-${id}`, title: `title-${id}`
  }]))
  const requireFromLevels = createRequire(levelsFile)
  const module = { exports: {} }
  const initialize = vm.runInNewContext(`(function(require, module, exports) {\n${fs.readFileSync(levelsFile, 'utf8')}\n})`, {}, { filename: levelsFile })
  initialize(request => requireFromLevels.resolve(request) === catalogFile ? changedCatalog : requireFromLevels(request), module, module.exports)
  for (const [id, metadata] of Object.entries(changedCatalog)) {
    assert.equal(module.exports[id].mode, metadata.mode)
    assert.equal(module.exports[id].title, metadata.title)
  }
})

test('the shared catalog can load in the main package before game subpackages', () => {
  loadCatalog()
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const packageRoots = (app.subPackages || []).map(pack => path.resolve(root, pack.root))
  const visited = new Set()
  function visit(file) {
    assert.ok(!packageRoots.some(packRoot => file === packRoot || file.startsWith(packRoot + path.sep)), `${file} must stay outside subpackages`)
    if (visited.has(file)) return
    visited.add(file)
    const source = fs.readFileSync(file, 'utf8')
    const requireFromFile = createRequire(file)
    for (const [, , request] of source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      assert.ok(request.startsWith('.'), 'shared client catalog dependencies are project-relative modules')
      visit(requireFromFile.resolve(request))
    }
  }
  visit(catalogFile)
})
