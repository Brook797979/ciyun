const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function runtimeImages() {
  const catalogs = [
    require('../games/data/chapter-one'),
    require('../games/data/levels'),
    require('../games/data/shape-questions'),
    require('../games/data/questions')
  ]
  const images = new Set()
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'image' || key === 'src') && typeof child === 'string') images.add(child)
      else visit(child)
    }
  }
  catalogs.forEach(visit)
  return images
}

test('all runtime game images are packaged PNG or JPEG files with matching signatures', () => {
  const images = runtimeImages()
  assert.equal(images.size, 18, 'all ten motifs, three puzzles and five vessel pictures must be covered')
  for (const image of images) {
    assert.match(image, /^\/games\/assets\//, `${image} must remain available locally`)
    const extension = path.extname(image).toLowerCase()
    assert.ok(['.png', '.jpg', '.jpeg'].includes(extension), `${image} must use an upload-supported image extension`)
    const absolute = path.join(root, image.slice(1))
    assert.ok(fs.existsSync(absolute), `${image} must be packaged on disk`)
    const bytes = fs.readFileSync(absolute)
    if (extension === '.png') {
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${image} needs a real PNG signature`)
    } else {
      assert.deepEqual(bytes.subarray(0, 3), Buffer.from([255, 216, 255]), `${image} needs a real JPEG signature`)
      assert.deepEqual(bytes.subarray(-2), Buffer.from([255, 217]), `${image} needs a complete JPEG stream`)
    }
  }
})
