const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const functionRoot = path.resolve(__dirname, '../cloudfunctions/video-playback')
const fileRoot = 'cloud://cloud1-d7gew23w04c3def7d.636c-cloud1-d7gew23w04c3def7d-1501415161/'
const museumIds = ['001', '002', '003', '004', '007', '005', '006', '008', '009', '010']
const classroomIds = [
  'carousel-ceramic-life', 'carousel-longquan-celadon', 'carousel-kiln-millennium', 'carousel-ceramic-history',
  'selected-ru-porcelain', 'selected-three-step-vase', 'selected-cactus-making', 'selected-bowl-making',
  'selected-throwing-basics', 'selected-white-vase'
]

function signedFiles({ fileList }) {
  return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: 'https://example.invalid/video.mp4' })) }
}

function loadPlayback(sign = signedFiles) {
  const exports = {}
  const calls = []
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'current',
    init() {},
    async getTempFileURL(options) {
      calls.push(JSON.parse(JSON.stringify(options)))
      return sign(options)
    }
  }
  vm.runInNewContext(fs.readFileSync(path.join(functionRoot, 'index.js'), 'utf8'), {
    exports, Date,
    require(name) {
      if (name === 'wx-server-sdk') return cloud
      if (name === './catalog.json') return JSON.parse(fs.readFileSync(path.join(functionRoot, 'catalog.json'), 'utf8'))
      throw new Error('Unexpected video-playback dependency')
    }
  })
  return { main: exports.main, calls }
}

test('museum playback allowlist includes all ten independent ceramic videos', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(functionRoot, 'catalog.json'), 'utf8'))
  assert.deepEqual(catalog.slice(0, 10).map(item => item.id), classroomIds)
  assert.equal(catalog.length, 20)
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length)
  assert.deepEqual(catalog.slice(10), museumIds.map(id => ({
    id: `ceramic-video-${id}`, fileID: `${fileRoot}videos/ceramic-detail/ceramic-${id}.mp4`
  })))
})

test('omitted selection continues signing only the ten classroom videos', async () => {
  const { main, calls } = loadPlayback()
  for (const event of [undefined, {}]) {
    const before = Date.now()
    const result = await main(event)
    assert.deepEqual(Array.from(result.videos, item => item.id), classroomIds)
    assert.equal(calls.at(-1).fileList.length, 10)
    assert.ok(calls.at(-1).fileList.every(file => !file.includes('/ceramic-detail/')))
    assert.ok(result.expiresAt >= before + 45 * 60 * 1000)
    assert.ok(result.expiresAt <= Date.now() + 45 * 60 * 1000)
  }
})

test('each museum request signs only the selected fixed catalog file', async () => {
  const { main, calls } = loadPlayback()
  for (const id of museumIds) {
    const result = await main({ ids: [`ceramic-video-${id}`] })
    assert.deepEqual(calls.at(-1).fileList, [`${fileRoot}videos/ceramic-detail/ceramic-${id}.mp4`])
    assert.deepEqual(Array.from(result.videos, item => ({ ...item })), [
      { id: `ceramic-video-${id}`, url: 'https://example.invalid/video.mp4' }
    ])
  }
})

test('arbitrary personal storage paths and unknown IDs reject before any signing', async () => {
  const { main, calls } = loadPlayback()
  for (const id of [
    'ceramic-video-011', 'unknown', `${fileRoot}ciyun/uploads/personal.mp4`,
    'ciyun/generated/personal.mp4', 'https://example.invalid/private.mp4', '../private.mp4'
  ]) {
    await assert.rejects(main({ ids: ['ceramic-video-001', id] }), /Unknown video ID/)
  }
  assert.equal(calls.length, 0)
})

test('invalid selections reject before signing and duplicate allowed IDs sign once', async () => {
  const { main, calls } = loadPlayback()
  for (const ids of [null, '', {}, [], new Array(21).fill('ceramic-video-001')]) {
    await assert.rejects(main({ ids }), /Invalid video selection/)
  }
  for (const ids of [[null], [1], [{}]]) {
    await assert.rejects(main({ ids }), /Unknown video ID/)
  }
  assert.equal(calls.length, 0)
  const result = await main({ ids: ['ceramic-video-002', 'ceramic-video-001', 'ceramic-video-002'] })
  assert.deepEqual(Array.from(result.videos, item => item.id), ['ceramic-video-002', 'ceramic-video-001'])
  assert.equal(calls[0].fileList.length, 2)
})

test('an unavailable museum video fails its request while default classroom playback succeeds', async () => {
  const { main, calls } = loadPlayback(options => ({
    fileList: signedFiles(options).fileList.map(item => item.fileID.includes('/ceramic-detail/')
      ? { fileID: item.fileID, status: -1, tempFileURL: '' } : item)
  }))
  await assert.rejects(main({ ids: ['ceramic-video-004'] }), /Could not obtain video URLs/)
  assert.equal(calls[0].fileList.length, 1)
  const result = await main()
  assert.equal(result.videos.length, 10)
  assert.equal(calls[1].fileList.length, 10)
})

test('storage signing errors return a generic error without exposing provider details', async () => {
  const { main } = loadPlayback(() => { throw new Error('private-path-and-provider-response') })
  await assert.rejects(main({ ids: ['ceramic-video-001'] }), error => {
    assert.equal(error.message, 'Could not obtain video URLs')
    return true
  })
})
