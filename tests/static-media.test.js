const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const mediaFile = path.join(root, 'utils/static-media.js')
const manifestFile = path.join(root, 'utils/static-media-manifest.json')

function loadMedia(t) {
  assert.ok(fs.existsSync(mediaFile), 'the explicit client-only static media resolver exists')
  const previous = require.cache[mediaFile]
  delete require.cache[mediaFile]
  const media = require(mediaFile)
  t.after(() => {
    if (previous) require.cache[mediaFile] = previous
    else delete require.cache[mediaFile]
  })
  return media
}

function reload(file) {
  const absolute = path.join(root, file)
  delete require.cache[absolute]
  return require(absolute)
}

function manifest() {
  assert.ok(fs.existsSync(manifestFile), 'public static images have an explicit cloud manifest')
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
}

test('WeChat JS-only modules initialize the app and register the complete AI creation page', () => {
  const vm = require('node:vm')
  const modules = new Map()
  const apps = []
  const pages = []
  const initialization = []
  const context = vm.createContext({
    App: value => apps.push(value),
    Page: value => pages.push(value),
    wx: { cloud: { init: options => initialization.push(options) } }
  })
  function loadJs(file) {
    const absolute = path.resolve(root, file)
    if (modules.has(absolute)) return modules.get(absolute).exports
    assert.ok(fs.existsSync(absolute), `module '${path.relative(root, absolute)}' is not defined`)
    const module = { exports: {} }
    modules.set(absolute, module)
    const requireJs = request => {
      assert.ok(request.startsWith('.'), 'client modules use project-relative JS dependencies')
      // Native WeChat resolves explicit .json requests to .json.js, unlike Node.
      const jsRequest = request.endsWith('.js') ? request : request + '.js'
      return loadJs(path.resolve(path.dirname(absolute), jsRequest))
    }
    const source = fs.readFileSync(absolute, 'utf8')
    const initialize = vm.runInContext(`(function(require, module, exports) {\n${source}\n})`, context, { filename: absolute })
    initialize(requireJs, module, module.exports)
    return module.exports
  }
  loadJs('app.js')
  assert.equal(initialization.length, 1, 'the manifest dependency must not prevent wx.cloud.init')
  assert.equal(apps.length, 1)
  loadJs('pages/ai-create/index.js')
  assert.equal(pages.length, 1, 'the native runtime must receive the real page definition')
  assert.equal(typeof pages[0].generate, 'function')
  assert.equal(pages[0].data.styles[0].image, manifest().cloudRoot + '/assets/ai-create/style-qinghua.jpg')
  assert.deepEqual(require('../utils/static-media-manifest.js'), manifest(), 'runtime JS and build metadata must stay identical')
})

test('static media stays local until app initialization explicitly enables it', t => {
  const media = loadMedia(t)
  const local = '/assets/ceramics/ming-blue-white-meiping.jpg'
  assert.equal(media.mediaUrl(local), local)
  assert.deepEqual(media.resolveMedia({ image: local, nested: [local] }), { image: local, nested: [local] })
  media.enableCloudMedia()
  assert.equal(media.mediaUrl(local), manifest().cloudRoot + local)
})

test('archived image URLs remain public for saved works without retaining obsolete local copies', t => {
  const media = loadMedia(t)
  const declared = manifest()
  assert.ok(Array.isArray(declared.legacyFiles) && declared.legacyFiles.length > 0)
  assert.equal(new Set([...declared.files, ...declared.legacyFiles]).size, declared.files.length + declared.legacyFiles.length)
  media.enableCloudMedia()
  for (const file of declared.legacyFiles) {
    assert.match(file, /^\/assets\/[a-z0-9_./-]+\.(?:png|jpe?g|svg)$/i)
    assert.equal(fs.existsSync(path.join(root, file.slice(1))), false, `${file} is retained through the CDN rather than an obsolete repository copy`)
    assert.equal(media.mediaUrl(file), declared.cloudRoot + file)
  }
  const { createWorkViews } = reload('utils/ai-work-view.js')
  const saved = [{ id: 'legacy-saved', creationType: 'digital', image: '/assets/craft/meiping-v1/cloud-preview.jpg' }]
  assert.equal(createWorkViews(saved)[0].image, declared.cloudRoot + saved[0].image)
  assert.equal(saved[0].image, '/assets/craft/meiping-v1/cloud-preview.jpg')
})

test('public media uses the exact hosted HTTPS root and only declared public image paths map', t => {
  const media = loadMedia(t)
  const declared = manifest()
  assert.equal(declared.cloudRoot, 'https://cloud1-d7gew23w04c3def7d-1501415161.tcloudbaseapp.com/ciyun-static/v1')
  const rootUrl = new URL(declared.cloudRoot)
  assert.equal(rootUrl.protocol, 'https:')
  assert.equal(rootUrl.hostname, 'cloud1-d7gew23w04c3def7d-1501415161.tcloudbaseapp.com')
  assert.equal(rootUrl.pathname, '/ciyun-static/v1')
  assert.equal(rootUrl.port, '')
  assert.equal(rootUrl.username, '')
  assert.equal(rootUrl.password, '')
  assert.equal(rootUrl.search, '')
  assert.equal(rootUrl.hash, '')
  assert.ok(declared.files.length > 100)
  assert.equal(new Set(declared.files).size, declared.files.length)
  media.enableCloudMedia()
  for (const file of declared.files) {
    assert.match(file, /^\/assets\/[a-z0-9_./-]+\.(?:png|jpe?g|svg)$/i)
    assert.ok(fs.existsSync(path.join(root, file.slice(1))), file)
    assert.equal(media.mediaUrl(file), declared.cloudRoot + file)
  }
  for (const value of [null, 0, false, '', '/pages/craft/index', '/assets/missing.png', '/assets/../private/a.png',
    'https://example.com/image.jpg', 'https://example.com/private/user.png?sign=keep',
    'https://cloud1-d7gew23w04c3def7d-1501415161.tcloudbaseapp.com/private/user.png',
    'http://tmp/picked.jpg', 'wxfile://tmp/photo.jpg',
    'cloud://bucket/private/generated.png', '/private/generated.png', 'assets/ceramics/ming-blue-white-meiping.jpg']) {
    assert.equal(media.mediaUrl(value), value)
  }
})

test('recursive display resolution copies nested data without mutating shared catalogs or private assets', t => {
  const media = loadMedia(t)
  const original = require('../data/ceramics')
  const before = JSON.stringify(original)
  const find = () => 'unchanged'
  const input = Object.freeze({ items: original, find, assetId: 'asset-123', image: 'cloud://bucket/private/user.png', nil: null })
  media.enableCloudMedia()
  const resolved = media.resolveMedia(input)
  assert.notEqual(resolved, input)
  assert.notEqual(resolved.items, original)
  assert.notEqual(resolved.items[0], original[0])
  assert.equal(resolved.items[0].image, manifest().cloudRoot + original[0].image)
  assert.equal(resolved.items[0].video.src, original[0].video.src)
  assert.equal(resolved.find, find)
  assert.equal(resolved.assetId, input.assetId)
  assert.equal(resolved.image, input.image)
  assert.equal(resolved.nil, null)
  assert.equal(JSON.stringify(original), before)
})

test('craft previews and persisted historical digital works map while private AI hydration is preserved', async t => {
  const media = loadMedia(t)
  media.enableCloudMedia()
  const { getCraftPreview } = reload('utils/craft-preview.js')
  const prefix = manifest().cloudRoot
  assert.equal(getCraftPreview('meiping', 'pattern-lotus', 'glaze-white'), prefix + '/assets/craft/two-vessel-v2/meiping/lotus-preview.jpg')
  assert.equal(getCraftPreview('yuhuchun', 'pattern-cloud', 'glaze-sky'), prefix + '/assets/craft/glazes-v1/yuhuchun/cloud-sky.jpg')
  const { createWorkViews, resolveWorkViews } = reload('utils/ai-work-view.js')
  const works = [
    { id: 'old-digital', creationType: 'digital', image: '/assets/craft/meiping-v1/cloud-preview.jpg' },
    { id: 'case', creationType: 'ai', source: 'showcase', image: '/assets/ai-showcase/lotus-qinghua.jpg' },
    { id: 'private', creationType: 'ai', assetId: 'asset-user', image: 'cloud://bucket/private/user.png' }
  ]
  const before = JSON.stringify(works)
  assert.equal(createWorkViews(works)[0].image, prefix + works[0].image)
  const resolved = await resolveWorkViews(works, async ids => {
    assert.deepEqual(ids, ['asset-user'])
    return [{ assetId: 'asset-user', url: 'https://example.com/private-signed.jpg', expiresAt: 1000 }]
  })
  assert.equal(resolved[0].image, prefix + works[0].image)
  assert.equal(resolved[1].image, prefix + works[1].image)
  assert.equal(resolved[2].image, 'https://example.com/private-signed.jpg')
  assert.equal(JSON.stringify(works), before)
})

function pageDefinition(t, pageName) {
  const previousPage = global.Page
  const previousWx = global.wx
  let definition
  global.Page = value => { definition = value }
  global.wx = { getStorageSync: () => '', setNavigationBarTitle() {}, cloud: {} }
  t.after(() => { global.Page = previousPage; global.wx = previousWx })
  reload(`pages/${pageName}/index.js`)
  return { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update) } }
}

test('all 216 craft previews use hosted images in the packaged mini program', t => {
  const media = loadMedia(t)
  media.enableCloudMedia()
  const { getCraftPreview } = reload('utils/craft-preview.js')
  const declared = manifest()
  let combinations = 0
  for (const shape of require('../data/shapes')) {
    for (const pattern of require('../data/patterns')) {
      for (const glaze of require('../data/glazes')) {
        const value = getCraftPreview(shape.id, pattern.id, glaze.id)
        assert.ok(value.startsWith(declared.cloudRoot + '/assets/craft/'), `${shape.id}/${pattern.id}/${glaze.id} must not depend on an excluded local image`)
        combinations++
      }
    }
  }
  assert.equal(combinations, 216)
})

test('client imports include destructured videos, identification examples and rebuilt challenge progress', t => {
  const media = loadMedia(t)
  media.enableCloudMedia()
  const prefix = manifest().cloudRoot
  const identify = pageDefinition(t, 'ai-identify')
  assert.equal(identify.data.cases[0].image, prefix + require('../data/showcase').identificationCases[0].image)
  const video = pageDefinition(t, 'video-detail')
  video.onLoad({ id: 'selected-three-step-vase' })
  assert.equal(video.data.item.cover, prefix + '/assets/videos/selected-three-step-vase.jpg')
  assert.match(video.data.item.src, /\/videos\/selected\//)
  const challenge = pageDefinition(t, 'challenge')
  const localBackground = require('../data/challenge-map').chapters[0].background
  assert.equal(challenge.data.chapters[0].background, prefix + localBackground)
  challenge.onShow()
  assert.equal(challenge.data.chapters[0].background, prefix + localBackground)
  const workshop = pageDefinition(t, 'workshop')
  assert.equal(workshop.data.recentHeadingIcon, prefix + '/assets/icons/workshop-recent-reference-ui.png')
  assert.equal(workshop.data.emptyVaseImage, prefix + '/assets/workshop/ai-creation-reference.jpg')
})

test('app enables media only after cloud initialization and templates retain local shared backgrounds', t => {
  const media = loadMedia(t)
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  const vm = require('node:vm')
  const local = '/assets/ceramics/ming-blue-white-meiping.jpg'
  const order = []
  const boot = wx => vm.runInNewContext(source, { wx, App() {}, require: () => ({ enableCloudMedia() { order.push('enable'); media.enableCloudMedia() } }) })
  boot({})
  assert.equal(media.mediaUrl(local), local)
  assert.deepEqual(order, [])
  boot({ cloud: { init() { order.push('init'); assert.equal(media.mediaUrl(local), local) } } })
  assert.deepEqual(order, ['init', 'enable'])
  assert.equal(media.mediaUrl(local), manifest().cloudRoot + local)
  const template = fs.readFileSync(path.join(root, 'pages/video-learning/index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'pages/video-learning/index.wxss'), 'utf8')
  assert.match(template, /\/assets\/banners\/home-hero\.jpg/)
  assert.match(template, /<image[^>]+src="\/assets\/backgrounds\/home-paper\.png"/)
  assert.doesNotMatch(css, /url\(\s*['"]?\/assets\//)
  const workshop = fs.readFileSync(path.join(root, 'pages/workshop/index.wxml'), 'utf8')
  assert.match(workshop, /class="recent-heading-icon-source" src="\{\{recentHeadingIcon\}\}"/)
  assert.match(workshop, /class="recent-empty-vase" src="\{\{emptyVaseImage\}\}"/)
})

function keptLocal(file) {
  return file.startsWith('/games/assets/')
    || file.startsWith('/assets/profile/') || file.startsWith('/assets/ai-chat/') || file === '/assets/backgrounds/home-paper.png'
    || file === '/assets/banners/home-hero.jpg' || file.startsWith('/assets/patterns/')
    || file.startsWith('/assets/challenge/') && file.endsWith('.png')
    || file.startsWith('/assets/challenge/badges/') && file.endsWith('.webp')
    || file.startsWith('/assets/icons/') && file !== '/assets/icons/workshop-recent-reference-ui.png'
}

test('pack ignores remote images, keeps game artwork local and budgets each package independently below 2 MiB', t => {
  const declared = manifest()
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  const packageRoots = (app.subPackages || []).map(pack => pack.root.replace(/\\/g, '/').replace(/\/$/, ''))
  const packageBytes = new Map([['main', 0], ...packageRoots.map(packRoot => [packRoot, 0])])
  const ignored = file => config.packOptions.ignore.some(rule => file === rule.value || rule.type === 'folder' && file.startsWith(rule.value + '/'))
  let imageCount = 0
  function checkAssets(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (entry.isDirectory()) checkAssets(absolute)
      else if (/\.(?:png|jpe?g|svg|webp)$/i.test(relative)) {
        imageCount++
        const file = '/' + relative
        if (relative.endsWith('.webp')) {
          assert.equal(ignored(relative), true, `${relative} is an archived source, not a phone package image`)
          assert.equal(declared.files.includes(file), false, 'archived sources do not require network delivery')
          continue
        }
        assert.equal(ignored(relative), !keptLocal(file), relative)
        assert.equal(declared.files.includes(file), !keptLocal(file), relative)
      }
    }
  }
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (ignored(relative)) continue
      if (entry.isDirectory()) visit(absolute)
      else {
        const owner = packageRoots.find(packRoot => relative.startsWith(packRoot + '/')) || 'main'
        packageBytes.set(owner, packageBytes.get(owner) + fs.statSync(absolute).size)
      }
    }
  }
  checkAssets(path.join(root, 'assets'))
  checkAssets(path.join(root, 'games/assets'))
  const media = loadMedia(t)
  media.enableCloudMedia()
  for (const entry of fs.readdirSync(path.join(root, 'games/assets'))) {
    const file = '/games/assets/' + entry
    assert.equal(media.mediaUrl(file), file, `${file} must load from the game package even after cloud media is enabled`)
  }
  visit(root)
  assert.ok(imageCount > 180)
  for (const [name, bytes] of packageBytes) {
    assert.ok(bytes < 2 * 1024 * 1024, `${name}: ${bytes} bytes exceeds the 2 MiB package source budget`)
    t.diagnostic(`${name}: ${bytes} source bytes`)
  }
  for (const file of declared.files) assert.equal(keptLocal(file), false)
})

test('packaged main modules cannot import code from an unloaded subpackage', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  const packageRoots = (app.subPackages || []).map(pack => path.resolve(root, pack.root))
  const packageFor = absolute => packageRoots.find(packRoot => absolute === packRoot || absolute.startsWith(packRoot + path.sep))
  const ignored = file => config.packOptions.ignore.some(rule => file === rule.value || rule.type === 'folder' && file.startsWith(rule.value + '/'))
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (ignored(relative) || packageFor(absolute)) continue
      if (entry.isDirectory()) visit(absolute)
      else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(absolute, 'utf8')
        for (const [, , request] of source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
          if (!request.startsWith('.') && !request.startsWith('/')) continue
          const dependency = request.startsWith('/')
            ? path.resolve(root, request.slice(1)) : path.resolve(path.dirname(absolute), request)
          assert.equal(packageFor(dependency), undefined, `${relative} imports subpackage code through ${request}`)
        }
      }
    }
  }
  visit(root)
})
