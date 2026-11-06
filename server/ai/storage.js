const { error } = require('./errors')
const { imageType } = require('./validation')
const MAX_RESULT_BYTES = 15 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30000
const TRUSTED_HOSTS = ['volces.com', 'volcengine.com', 'byteimg.com']
function checkedUrl(value, trustedHosts) {
  let url
  try { url = new URL(value) } catch { throw error('INVALID_RESULT_URL') }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !trustedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw error('INVALID_RESULT_URL')
  return url
}
async function downloadImage(value, { fetchImpl = globalThis.fetch, maxBytes = MAX_RESULT_BYTES, trustedHosts = TRUSTED_HOSTS } = {}) {
  let url = checkedUrl(value, trustedHosts)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  timer.unref?.()
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(url.toString(), { redirect: 'manual', signal: controller.signal })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        if (redirects === 3 || !response.headers.get('location')) throw error('INVALID_RESULT_URL')
        url = checkedUrl(new URL(response.headers.get('location'), url).toString(), trustedHosts)
        continue
      }
      if (!response.ok || !response.body) throw error('STORAGE_ERROR', true)
      const length = Number(response.headers.get('content-length'))
      if (length > maxBytes) { await response.body.cancel(); throw error('INVALID_IMAGE') }
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      try {
        while (true) {
          const { done, value: chunk } = await reader.read()
          if (done) break
          size += chunk.byteLength
          if (size > maxBytes) { await reader.cancel(); throw error('INVALID_IMAGE') }
          chunks.push(Buffer.from(chunk))
        }
      } finally { reader.releaseLock() }
      const bytes = Buffer.concat(chunks)
      imageType(bytes, maxBytes)
      return bytes
    }
    throw error('INVALID_RESULT_URL')
  } finally { clearTimeout(timer) }
}
function createStorage({ cloud, env = process.env, fetchImpl = globalThis.fetch, clock = Date.now }) {
  return {
    validateFileId(fileId, cloudPath) {
      let context = {}
      try { context = cloud.getWXContext?.() || {} } catch {}
      const environment = env.TCB_ENV || env.CLOUDBASE_ENV_ID || context.ENV || env.SCF_NAMESPACE
      const prefix = env.CLOUD_STORAGE_PREFIX
      if (!environment && !prefix) throw error('STORAGE_NOT_CONFIGURED')
      if (prefix) return fileId === `${prefix.replace(/\/?$/, '/')}${cloudPath}`
      if (!fileId.startsWith(`cloud://${environment}.`) && !fileId.startsWith(`cloud://${environment}/`)) return false
      const slash = fileId.indexOf('/', 'cloud://'.length)
      return slash > 0 && fileId.slice(slash + 1) === cloudPath
    },
    async download(fileId) {
      try { const result = await cloud.downloadFile({ fileID: fileId }); return Buffer.from(result.fileContent) }
      catch { throw error('STORAGE_ERROR', true) }
    },
    async saveVerified(bytes, cloudPath) {
      if (!cloudPath.startsWith('ai/verified/')) throw error('INVALID_ASSET')
      try {
        const result = await cloud.uploadFile({ cloudPath, fileContent: bytes })
        if (!result.fileID) throw new Error()
        return result.fileID
      } catch { throw error('STORAGE_ERROR', true) }
    },
    async sign(fileIds) {
      try {
        const result = await cloud.getTempFileURL({ fileList: fileIds.map(fileID => ({ fileID, maxAge: 300 })) })
        return fileIds.map(fileId => {
          const entry = result.fileList.find(item => item.fileID === fileId)
          if (!entry?.tempFileURL || (entry.status !== undefined && entry.status !== 0)) throw new Error()
          return { fileId, url: entry.tempFileURL, expiresAt: clock() + 300000 }
        })
      } catch { throw error('STORAGE_ERROR', true) }
    },
    async importImage(url, cloudPath) {
      const bytes = await downloadImage(url, { fetchImpl })
      const format = imageType(bytes, MAX_RESULT_BYTES)
      try {
        const result = await cloud.uploadFile({ cloudPath: cloudPath.replace(/\.[^.]+$/, `.${format}`), fileContent: bytes })
        if (!result.fileID) throw new Error()
        return result.fileID
      } catch { throw error('STORAGE_ERROR', true) }
    }
  }
}
module.exports = { createStorage, downloadImage, MAX_RESULT_BYTES, TRUSTED_HOSTS, DOWNLOAD_TIMEOUT_MS }
