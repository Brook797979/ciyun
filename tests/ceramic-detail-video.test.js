const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.js'), 'utf8')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function loadDetail(options = {}) {
  let definition
  let now = 1800000000000
  const calls = { cloud: [], play: 0, pause: 0, preview: [], toast: [], growth: [] }
  const items = [
    { id: 'ceramic-001', name: '藏品一', image: '/assets/whole-vase.jpg', video: { id: 'ceramic-video-001', src: 'cloud://museum/videos/one.mp4', cover: '/assets/poster.jpg' } },
    { id: 'ceramic-002', name: '藏品二', image: '/assets/whole-bowl.jpg', video: { id: 'ceramic-video-002', src: '', cover: '/assets/poster-two.jpg' } }
  ]
  if (options.src !== undefined) items[0].video.src = options.src
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375 }),
    cloud: { callFunction(request) {
      calls.cloud.push(request)
      return options.resolve ? options.resolve(request) : Promise.resolve({ result: {
        videos: [{ id: 'ceramic-video-001', url: 'https://media.example/one.mp4' }], expiresAt: now + 600000
      } })
    } },
    createVideoContext(id, page) {
      assert.equal(id, 'ceramic-detail-video')
      assert.ok(page)
      return { play() { calls.play++ }, pause() { calls.pause++ } }
    },
    previewImage(value) { calls.preview.push(value) },
    showToast(value) { calls.toast.push(value) },
    getStorageSync() { throw new Error('playback must not read persistent storage') },
    setStorageSync() { throw new Error('playback must not write persistent storage') }
  }
  vm.runInNewContext(source, {
    Page(value) { definition = value }, wx,
    Date: class extends Date { static now() { return now } },
    require(id) {
      if (id === '../../utils/static-media') return { resolveMedia: value => value }
      if (id === '../../data/ceramics') return items
      if (id === '../../utils/navigation') return { go() {} }
      if (id === '../../utils/growth-progress') return { createGrowthProgress: () => ({ recordGrowthEvent(...args) { calls.growth.push(args) } }) }
      throw new Error(`Unexpected dependency ${id}`)
    }
  })
  function createPage(id = 'ceramic-001') {
    const page = {
      ...definition, data: { ...definition.data }, updates: [],
      setData(update, callback) {
        this.updates.push(update)
        Object.assign(this.data, update)
        if (callback) callback()
      }
    }
    page.onLoad({ id })
    return page
  }
  return { page: createPage(), createPage, calls, wx, advance(ms) { now += ms } }
}

test('detail opens the complete collection image in the native image preview', () => {
  const { page, calls } = loadDetail()
  page.previewCeramic()
  assert.equal(calls.preview[0].current, '/assets/whole-vase.jpg')
  assert.deepEqual(Array.from(calls.preview[0].urls), ['/assets/whole-vase.jpg'])
  assert.equal(calls.growth[0][0], 'ceramic_viewed')
})

test('cloud video loads only after a tap and duplicate taps share one request', async () => {
  const pending = deferred()
  const { page, calls } = loadDetail({ resolve: () => pending.promise })
  assert.equal(calls.cloud.length, 0)
  assert.equal(page.data.videoUrl, '')
  const first = page.playRelatedVideo()
  const duplicate = page.playRelatedVideo()
  assert.equal(page.data.videoState, 'loading')
  assert.equal(calls.cloud.length, 1)
  assert.equal(calls.cloud[0].name, 'video-playback')
  assert.deepEqual(Array.from(calls.cloud[0].data.ids), ['ceramic-video-001'])
  pending.resolve({ result: { videos: [{ id: 'ceramic-video-001', url: 'https://media.example/one.mp4' }], expiresAt: 1800000600000 } })
  await Promise.all([first, duplicate])
  assert.equal(page.data.videoUrl, 'https://media.example/one.mp4')
  assert.equal(page.data.videoState, 'ready')
  assert.equal(calls.play, 1)
  page.onVideoPlay()
  assert.equal(page.data.videoState, 'playing')
})

test('blank video source shows a clear pending label without starting playback', async () => {
  const { createPage, calls } = loadDetail()
  const page = createPage('ceramic-002')
  await page.playRelatedVideo()
  assert.equal(calls.cloud.length, 0)
  assert.equal(calls.play, 0)
  assert.equal(page.data.videoUrl, '')
  assert.equal(calls.toast[0].title, '影像待补充')
})

test('valid cloud playback URLs are reused in memory and refreshed after expiry', async () => {
  const { page, createPage, calls, advance } = loadDetail()
  await page.playRelatedVideo()
  const revisit = createPage()
  await revisit.playRelatedVideo()
  assert.equal(calls.cloud.length, 1)
  advance(600001)
  const expired = createPage()
  await expired.playRelatedVideo()
  assert.equal(calls.cloud.length, 2)
})

test('network failure presents a retry that resolves and plays a new URL', async () => {
  let attempt = 0
  const { page, calls } = loadDetail({ resolve: () => {
    attempt++
    return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ result: {
      videos: [{ id: 'ceramic-video-001', url: 'https://media.example/retry.mp4' }], expiresAt: 1800000600000
    } })
  } })
  await page.playRelatedVideo()
  assert.equal(page.data.videoState, 'error')
  assert.equal(page.data.videoUrl, '')
  assert.ok(page.data.videoError)
  await page.playRelatedVideo()
  assert.equal(page.data.videoUrl, 'https://media.example/retry.mp4')
  assert.equal(calls.cloud.length, 2)
  assert.equal(calls.play, 1)
})

test('player error evicts the cached URL so retry requests a fresh one', async () => {
  const { page, calls } = loadDetail()
  await page.playRelatedVideo()
  page.onVideoError()
  assert.equal(page.data.videoState, 'error')
  assert.equal(page.data.videoUrl, '')
  await page.playRelatedVideo()
  assert.equal(calls.cloud.length, 2)
  assert.equal(calls.play, 2)
})

test('missing, mismatched or insecure cloud URLs remain retryable errors', async () => {
  for (const videos of [[], [{ id: 'other-video', url: 'https://media.example/other.mp4' }], [{ id: 'ceramic-video-001', url: 'http://media.example/one.mp4' }]]) {
    const { page, calls } = loadDetail({ resolve: () => Promise.resolve({ result: { videos, expiresAt: 1800000600000 } }) })
    await page.playRelatedVideo()
    assert.equal(page.data.videoState, 'error')
    assert.equal(page.data.videoUrl, '')
    assert.equal(calls.play, 0)
    await page.playRelatedVideo()
    assert.equal(calls.cloud.length, 2)
  }
})

test('HTTPS videos play directly without a cloud lookup', async () => {
  const { page, calls } = loadDetail({ src: 'https://media.example/direct.mp4' })
  await page.playRelatedVideo()
  assert.equal(page.data.videoUrl, 'https://media.example/direct.mp4')
  assert.equal(calls.cloud.length, 0)
  assert.equal(calls.play, 1)
})

test('hiding and unloading pauses playback and late responses cannot update an unloaded page', async () => {
  const pending = deferred()
  const { page, calls } = loadDetail({ resolve: () => pending.promise })
  const loading = page.playRelatedVideo()
  page.onHide()
  page.onUnload()
  const updateCount = page.updates.length
  pending.resolve({ result: { videos: [{ id: 'ceramic-video-001', url: 'https://media.example/late.mp4' }], expiresAt: 1800000600000 } })
  await loading
  assert.equal(page.updates.length, updateCount)
  assert.ok(calls.pause >= 2)
  assert.equal(calls.play, 0)
  page.onVideoError()
  page.onVideoPlay()
  assert.equal(page.updates.length, updateCount)
})

test('a hidden page never starts a pending video and can retry when shown', async () => {
  const pending = deferred()
  const { page, calls } = loadDetail({ resolve: () => pending.promise })
  const loading = page.playRelatedVideo()
  page.onHide()
  pending.resolve({ result: { videos: [{ id: 'ceramic-video-001', url: 'https://media.example/late.mp4' }], expiresAt: 1800000600000 } })
  await loading
  assert.equal(calls.play, 0)
  page.onShow()
  await page.playRelatedVideo()
  assert.equal(calls.play, 1)
})

test('a delayed native play event after hiding pauses again without marking playback active', async () => {
  const { page, calls } = loadDetail()
  await page.playRelatedVideo()
  page.onHide()
  const pauseCount = calls.pause
  const updateCount = page.updates.length
  page.onVideoPlay()
  assert.equal(page.updates.length, updateCount)
  assert.equal(calls.pause, pauseCount + 1)
})

test('related video template provides native controls, contain fit, loading and retry feedback', () => {
  const template = fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/ceramic-detail/index.wxss'), 'utf8')
  assert.match(template, /<video[^>]+id="ceramic-detail-video"[^>]+src="\{\{videoUrl\}\}"[^>]+poster="\{\{item\.video\.cover\}\}"[^>]+object-fit="contain"/)
  assert.match(template, /autoplay="\{\{false\}\}"/)
  assert.match(template, /controls="\{\{true\}\}"/)
  assert.match(template, /binderror="onVideoError"/)
  assert.match(template, /bindplay="onVideoPlay"/)
  assert.match(template, /bindtap="playRelatedVideo"/)
  assert.match(template, /影像加载中/)
  assert.match(template, /点击重试/)
  assert.match(template, /影像待补充/)
  assert.match(styles, /\.related-video-player\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/)
})
