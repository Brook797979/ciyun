const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ceramics = require('../data/ceramics')
const manifest = require('../utils/static-media-manifest')
const videoCatalog = require('../cloudfunctions/video-playback/catalog.json')
const root = path.resolve(__dirname, '..')
const provided = { '001': '01:14', '002': '24:34', '003': '01:09', '004': '25:48', '005': '00:33', '006': '02:22', '007': '03:41', '008': '00:25', '009': '01:05', '010': '02:36' }
const providedTitles = {
  '001': '广庆祥拍卖丨清道光 青花缠枝莲纹赏瓶',
  '002': '北宋 汝窯 蓮花式溫碗',
  '003': '雍正粉彩花鸟纹抱月瓶｜大英博物馆收藏',
  '004': '【央视纪录】哥窑谜案（2011.04.27）',
  '005': '元青花 莲池鱼藻纹大盘 湖南博物院',
  '006': '白釉长颈瓶',
  '007': '【中原藏珍】异国情调｜唐三彩｜壶口像凤首',
  '008': '龙泉青瓷弟窑粉青釉双耳炉',
  '009': '稀世之宝！元青花云龙纹罐，国家博物馆典藏珍宝',
  '010': '一个杯价值2亿元，这个连乾隆都爱的瓷器，到底什么来头？'
}

test('all ten supplied groups use independent real photographs, real posters and actual video durations', () => {
  for (const [number, duration] of Object.entries(provided)) {
    const item = ceramics.find(item => item.id === `ceramic-${number}`)
    assert.equal(item.image, `/assets/ceramics/museum-white-20261020/${item.id}.jpg`)
    assert.equal(item.video.cover, `/assets/videos/museum-covers-20261020/${item.id}.jpg`)
    assert.equal(item.video.coverResourcePath, item.video.cover)
    assert.equal(item.video.title, providedTitles[number])
    assert.equal(item.video.duration, duration)
    assert.equal(item.video.id, `ceramic-video-${number}`)
    assert.match(item.video.src, /^cloud:\/\//)
    assert.equal(videoCatalog.find(video => video.id === item.video.id).fileID, item.video.src)
    for (const image of [item.image, item.video.cover]) {
      assert.ok(manifest.files.includes(image), `${image} must be published through the existing CDN resolver`)
      const bytes = fs.readFileSync(path.join(root, image.slice(1)))
      assert.equal(bytes.readUInt16BE(0), 0xffd8, 'the packaged photo is a real JPEG')
      assert.ok(bytes.length > 10000, 'the real photo cannot be a tiny blank placeholder')
    }
  }
})

test('video covers retain supplied video artwork independently from the ceramic object photo', () => {
  for (const [number, title] of Object.entries(providedTitles)) {
    const item = ceramics.find(item => item.id === `ceramic-${number}`)
    assert.equal(item.video.title, title)
    assert.equal(item.video.cover, `/assets/videos/museum-covers-20261020/${item.id}.jpg`)
    assert.equal(item.video.coverResourcePath, item.video.cover)
    assert.notEqual(item.video.cover, item.image)
    const posterBytes = fs.readFileSync(path.join(root, item.video.cover.slice(1)))
    const photoBytes = fs.readFileSync(path.join(root, item.image.slice(1)))
    assert.notDeepEqual(posterBytes, photoBytes, `${item.id} must not reuse the object photo as its video cover`)
  }
})

test('all ten real media replacements preserve stable collection IDs and independent video slots', () => {
  assert.deepEqual(ceramics.map(item => item.id), Array.from({ length: 10 }, (_, index) => `ceramic-${String(index + 1).padStart(3, '0')}`))
  assert.equal(new Set(ceramics.map(item => item.image)).size, 10)
  assert.equal(new Set(ceramics.map(item => item.video.cover)).size, 10)
  assert.equal(new Set(ceramics.map(item => item.video.src)).size, 10)
})

test('related bottle footage is identified accurately and the real Ge censer has no invented tripod description', () => {
  const blue = ceramics.find(item => item.id === 'ceramic-001')
  const rose = ceramics.find(item => item.id === 'ceramic-003')
  const ge = ceramics.find(item => item.id === 'ceramic-004')
  const lotus = ceramics.find(item => item.id === 'ceramic-005')
  assert.equal(blue.name, '青花缠枝莲纹梅瓶')
  assert.match(blue.video.title, /赏瓶/)
  assert.match(blue.video.description, /道光|清代/)
  assert.equal(rose.name, '粉彩花鸟纹瓶')
  assert.match(rose.video.title, /抱月瓶/)
  assert.equal(lotus.name, '青花莲纹大盘')
  assert.match(lotus.video.title, /莲池鱼藻纹大盘/)
  assert.doesNotMatch(JSON.stringify(ge), /三足/)
  assert.match(ge.type, /双耳/)
})
