const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function loadPage(wx) {
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/video-learning/index.js'), 'utf8'), {
    Page(value) { definition = value }, wx, Date, console,
    require(name) { return require(path.resolve(root, 'pages/video-learning', name)) }
  })
  return { ...definition, data: { ...definition.data }, setData(values, callback) {
    Object.assign(this.data, values)
    if (callback) callback()
  } }
}

test('classroom refreshes expired playback URLs before mounting a player', async () => {
  let requests = 0
  const page = loadPage({
    cloud: { async callFunction({ name }) {
      assert.equal(name, 'video-playback')
      requests++
      return { result: { videos: [{ id: 'selected-ru-porcelain', url: 'https://example.com/fresh.mp4' }], expiresAt: Date.now() + 2700000 } }
    } },
    createVideoContext() { return { play() {}, stop() {} } }
  })
  page.videoUrlsExpireAt = Date.now() - 1
  await page.playVideo({ currentTarget: { dataset: { id: 'selected-ru-porcelain' } } })
  assert.equal(requests, 1)
  assert.equal(page.data.videos[0].playUrl, 'https://example.com/fresh.mp4')
  assert.equal(page.data.playingVideoId, 'selected-ru-porcelain')
})

test('brand subtitle stays inside its header at 320–430px widths', () => {
  for (const windowWidth of [320, 375, 390, 430]) {
    const page = loadPage({
      getWindowInfo() { return { windowWidth } },
      getMenuButtonBoundingClientRect() { return { top: 52, bottom: 84 } }
    })
    page.onLoad()
    assert.ok(page.data.brandTop < 94, 'both brand lines should move upward')
    assert.ok(page.data.heroHeight >= page.data.brandTop + 100 * windowWidth / 750,
      `subtitle must not be clipped at ${windowWidth}px`)
  }
})

test('fullscreen keeps the active video mounted until returning to the classroom', async () => {
  const calls = []
  const page = loadPage({
    cloud: { async callFunction() {
      return { result: { videos: [{ id: 'carousel-ceramic-life', url: 'https://example.com/video.mp4' }], expiresAt: Date.now() + 2700000 } }
    } },
    createVideoContext() { return { play() {}, stop() { calls.push('stop') } } }
  })
  await page.playVideo({ currentTarget: { dataset: { id: 'carousel-ceramic-life' } } })
  page.onVideoFullscreenChange({ currentTarget: { dataset: { id: 'carousel-ceramic-life' } }, detail: { fullScreen: true } })
  page.onSwiperChange({ detail: { current: 1 } })
  assert.equal(page.data.playingVideoId, 'carousel-ceramic-life')
  assert.equal(page.data.isVideoFullscreen, true)
  assert.equal(calls.length, 0)
  page.onVideoFullscreenChange({ currentTarget: { dataset: { id: 'carousel-ceramic-life' } }, detail: { fullScreen: false } })
  assert.equal(page.data.playingVideoId, 'carousel-ceramic-life')
  assert.equal(page.data.isVideoFullscreen, false)
})
