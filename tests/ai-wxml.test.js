const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

for (const page of ['ai-create', 'ai-result', 'ai-identify', 'ai-identify-history', 'ai-chat', 'works', 'workshop']) {
  test(`${page} conditional bindings parse without HTML entity substitution`, () => {
    const markup = fs.readFileSync(path.join(__dirname, '..', 'pages', page, 'index.wxml'), 'utf8')
    const conditions = [...markup.matchAll(/wx:(?:if|elif)="\{\{([\s\S]*?)\}\}"/g)]
    assert.ok(conditions.length, 'page contains conditional states')
    for (const [, expression] of conditions) {
      assert.doesNotThrow(() => new vm.Script(`(${expression})`), `${page}: ${expression}`)
    }
  })
}
