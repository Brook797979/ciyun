const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function load() {
  const file = path.resolve(__dirname, '../utils/ai-work-view.js')
  assert.ok(fs.existsSync(file), 'AI work view hydration module exists')
  return require(file)
}

test('mixed works retain digital and showcase artwork while private AI images resolve', async () => {
  const { resolveWorkViews } = load()
  const works = [
    { id: 'digital', name: '青花', creationType: 'digital', image: '/assets/a.png' },
    { id: 'case', name: '月下莲影', creationType: 'ai', source: 'showcase', image: '/assets/case.jpg' },
    { id: 'real', name: '真实创作', creationType: 'ai', assetId: 'asset-1', image: 'expired-url' }
  ]
  let requested
  const result = await resolveWorkViews(works, async ids => {
    requested = ids
    return [{ assetId: 'asset-1', url: 'https://example.com/fresh.jpg', expiresAt: 1000 }]
  })
  assert.deepEqual(requested, ['asset-1'])
  assert.equal(result[0].image, works[0].image)
  assert.equal(result[1].image, works[1].image)
  assert.equal(result[1].creationLabel, '展示案例')
  assert.equal(result[2].image, 'https://example.com/fresh.jpg')
  assert.equal(result[2].creationLabel, 'AI创瓷')
  assert.equal(works[2].image, 'expired-url', 'hydration must not mutate persisted works')
})

test('failed private URL refresh marks an image unavailable without claiming success', async () => {
  const { resolveWorkViews } = load()
  const result = await resolveWorkViews([{id:'real',creationType:'ai',assetId:'asset-1',image:'expired-url'}], async () => {
    throw new Error('network unavailable')
  })
  assert.equal(result[0].image, '')
  assert.equal(result[0].imageUnavailable, true)
})

test('large work lists resolve unique asset ids in bounded batches', async () => {
  const { resolveWorkViews } = load()
  const works = Array.from({length:45}, (_,index)=>({id:`w-${index}`,creationType:'ai',assetId:`a-${index}`,image:'expired'}))
  works.push({...works[0],id:'duplicate-reference'})
  const sizes=[]
  const result = await resolveWorkViews(works, async ids => {
    sizes.push(ids.length)
    return ids.map(assetId=>({assetId,url:`https://example.com/${assetId}.jpg`}))
  })
  assert.deepEqual(sizes, [20,20,5])
  assert.equal(result[45].image, result[0].image)
})

test('private AI work without a stable asset is never previewed by stale URL', async () => {
  const { createWorkViews, resolveWorkViews } = load()
  const works=[{id:'real',creationType:'ai',image:'expired'}]
  assert.equal(createWorkViews(works)[0].image, '')
  const result=await resolveWorkViews(works, async ()=>{throw new Error('should not be called')})
  assert.equal(result[0].imageUnavailable,true)
})

test('works page awaits private link refresh and ignores an older refresh after reopening', async t => {
  const originalWx = global.wx
  const originalPage = global.Page
  let definition
  let stored = [{id:'old',name:'旧作品',creationType:'ai',assetId:'a-old',image:'expired'}]
  const requests=[]
  global.wx = {
    getStorageSync() {return stored},
    cloud:{callFunction(options){requests.push(options); return new Promise(()=>{})}}
  }
  global.Page = value => {definition=value}
  const file=path.resolve(__dirname,'../pages/works/index.js')
  delete require.cache[require.resolve(file)]
  require(file)
  t.after(()=>{global.wx=originalWx;global.Page=originalPage;delete require.cache[require.resolve(file)]})
  const page={...definition,data:{...definition.data},setData(update){Object.assign(this.data,update)}}
  page.onShow()
  assert.equal(requests.length,1,'private image addresses are refreshed by the actual page')
  assert.equal(page.data.works[0].image,'')
  stored=[{id:'new',name:'新作品',creationType:'digital',image:'/assets/new.jpg'}]
  page.onShow()
  requests[0].success({result:{ok:true,data:{assets:[{assetId:'a-old',url:'https://example.com/old.jpg'}]}}})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(page.data.works[0].id,'new','late first hydration must not replace the reopened list')
})

function worksPage(t, resolveAssets) {
  const vm = require('node:vm')
  let definition
  const previews = []; const toasts = []
  const stored = [{ id: 'real', creationType: 'ai', assetId: 'a', image: 'https://example.com/expired.jpg', imageExpiresAt: Date.now() - 1 }]
  const wx = { previewImage: value => previews.push(value), showToast: value => toasts.push(value) }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/works/index.js'), 'utf8'), {
    Page: value => { definition = value }, wx, Date, Promise,
    require: id => id === '../../utils/cloud-service' ? { createCloudService: () => ({ resolveAssets }) } : id === '../../utils/craft-works' ? { getWorks: () => stored } : require(path.resolve(__dirname, '../pages/works', id))
  })
  const page = { ...definition, data: { works: [{ id: 'real', creationType: 'ai', assetId: 'a', image: 'https://example.com/expired.jpg', imageExpiresAt: Date.now() - 1 }] }, setData: function (update) { Object.assign(this.data, update) } }
  return { page, previews, toasts, tap: { currentTarget: { dataset: { id: 'real' } } } }
}

test('preview refreshes a private image that expired while the works page stayed open', async t => {
  let calls = 0
  const { page, previews, tap } = worksPage(t, async () => {
    calls++
    return [{ assetId: 'a', url: 'https://example.com/fresh.jpg', expiresAt: Date.now() + 300000 }]
  })
  await page.previewWork(tap)
  assert.equal(calls, 1)
  assert.equal(previews[0].current, 'https://example.com/fresh.jpg')
  assert.equal(page.data.works[0].image, 'https://example.com/fresh.jpg')
})

test('unavailable private preview reports recovery without passing an expired URL to WeChat', async t => {
  const { page, previews, toasts, tap } = worksPage(t, async () => { throw new Error('offline') })
  await page.previewWork(tap)
  assert.equal(previews.length, 0)
  assert.equal(page.data.works[0].imageUnavailable, true)
  assert.ok(toasts.length)
})

test('private preview refresh is shared by duplicate taps and stops after leaving the page', async t => {
  let complete; let calls = 0
  const { page, previews, tap } = worksPage(t, () => { calls++; return new Promise(resolve => { complete = resolve }) })
  const first = page.previewWork(tap)
  const second = page.previewWork(tap)
  assert.equal(calls, 1)
  page.onHide()
  complete([{ assetId: 'a', url: 'https://example.com/fresh.jpg', expiresAt: Date.now() + 300000 }])
  await Promise.all([first, second])
  assert.equal(previews.length, 0)
})

test('returning to refreshed works can preview immediately despite an older unresolved request', async t => {
  let complete; let calls = 0
  const { page, previews, tap } = worksPage(t, () => {
    if (++calls === 1) return new Promise(resolve => { complete = resolve })
    return Promise.resolve([{ assetId: 'a', url: 'https://example.com/new-session.jpg', expiresAt: Date.now() + 300000 }])
  })
  const first = page.previewWork(tap)
  page.onHide()
  await page.onShow()
  const second = page.previewWork(tap)
  await new Promise(resolve => setImmediate(resolve))
  const immediatePreviews = previews.length
  complete([{ assetId: 'a', url: 'https://example.com/late.jpg', expiresAt: Date.now() + 300000 }])
  await Promise.all([first, second])
  assert.equal(immediatePreviews, 1, 'a previous visit must not block previewing the new link')
  assert.equal(previews[0].current, 'https://example.com/new-session.jpg')
  assert.equal(previews.length, 1)
})
