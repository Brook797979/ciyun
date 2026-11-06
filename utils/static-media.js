const manifest = require('./static-media-manifest')

const publicImages = new Set([...manifest.files, ...(manifest.legacyFiles || [])])
let cloudMediaEnabled = false

// Only the mini-program bootstrap opts in; shared Node catalogs stay local.
function enableCloudMedia() {
  cloudMediaEnabled = true
}

function mediaUrl(value) {
  return cloudMediaEnabled && publicImages.has(value) ? manifest.cloudRoot + value : value
}

function resolveMedia(value) {
  if (typeof value === 'string') return mediaUrl(value)
  if (Array.isArray(value)) return value.map(resolveMedia)
  if (!value || typeof value !== 'object') return value
  const resolved = { ...value }
  Object.keys(resolved).forEach(key => { resolved[key] = resolveMedia(resolved[key]) })
  return resolved
}

module.exports = { enableCloudMedia, mediaUrl, resolveMedia }
