const messages = {
  CLOUD_UNAVAILABLE: '云服务暂未连接，请稍后重试',
  CONFIG_MISSING: 'AI服务尚未配置，请联系管理员',
  MODEL_NOT_CONFIGURED: '实时体验暂未开启，可查看精选案例',
  UNAUTHENTICATED: '请重新进入小程序后再体验',
  INVALID_REQUEST: '提交内容不完整，请检查后重试',
  INVALID_ACTION: '当前体验暂时不可用，请重新进入',
  NOT_FOUND: '未找到此内容，请返回重新进入',
  INVALID_ASSET: '图片尚未准备好，请重新上传',
  INVALID_IMAGE: '图片无法识别，请换一张清晰的瓷器照片',
  IDEMPOTENCY_CONFLICT: '原任务仍在确认，请恢复原任务',
  GENERATION_IN_PROGRESS: '任务正在生成，请查看原任务进度',
  MODEL_INVALID_RESPONSE: 'AI返回内容格式异常，请重新尝试',
  MODEL_TIMEOUT: '生成等待超时，请查询原任务进度',
  RESULT_UNKNOWN: '暂时无法确认结果，请查询原任务',
  MODEL_ERROR: '本次AI体验未完成，请稍后重试',
  STORAGE_ERROR: '图片保存未完成，请稍后重新查询',
  STORAGE_NOT_CONFIGURED: '实时体验暂未开启，可查看精选案例',
  INVALID_RESULT_URL: '图片暂时无法读取，请重新加载',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  SERVICE_UNAVAILABLE: 'AI服务暂时不可用，请稍后重试',
  NETWORK_TIMEOUT: '连接超时，请查询原任务进度',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
  INVALID_RESPONSE: '服务响应异常，请稍后重试',
  INVALID_INPUT: '提交内容不完整，请检查后重试',
  RATE_LIMITED: '请求较多，请稍后再试',
  QUOTA_EXCEEDED: '实时体验暂时不可用，可查看精选案例',
  ASSET_FORBIDDEN: '无法访问这张图片，请使用自己的作品',
  FORBIDDEN: '无法访问此内容',
  ASSET_NOT_FOUND: '图片暂时无法读取，请重新上传',
  ASSET_URL_UNAVAILABLE: '图片链接暂时不可用，请重新加载',
  UPLOAD_FAILED: '图片上传失败，请重新选择',
  IMAGE_TOO_LARGE: '图片不能超过5MB，请换一张图片',
  UNSUPPORTED_IMAGE: '请选择JPG、PNG或WebP图片',
  TASK_NOT_FOUND: '未找到这个任务，请返回创瓷页查询',
  CONTENT_REJECTED: '内容未通过审核，请调整描述',
  GENERATION_FAILED: '本次生成失败，请调整创意后重试'
}
let sequence = 0

function createRequestId(prefix = 'ai') {
  sequence += 1
  return `${String(prefix).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'ai'}-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function serviceError(code, retryable = false) {
  const error = new Error(messages[code] || '服务暂时不可用，请稍后重试')
  error.code = typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'SERVICE_UNAVAILABLE'
  error.retryable = Boolean(retryable)
  return error
}

function networkError(error) {
  if (error && error.code && messages[error.code]) return serviceError(error.code, error.retryable)
  const detail = String(error && (error.errMsg || error.message) || '')
  return serviceError(/timeout|timed out|超时/i.test(detail) ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR', true)
}

// Accept both callback-based WeChat clients and newer promise-based clients.
function invoke(owner, method, options) {
  return new Promise((resolve, reject) => {
    try {
      const pending = owner[method]({ ...options, success: resolve, fail: reject })
      if (pending && typeof pending.then === 'function') pending.then(resolve, reject)
    } catch (error) { reject(error) }
  })
}

function createCloudService(platform) {
  async function callAI(action, payload = {}) {
    const cloud = platform && platform.cloud
    if (!cloud || typeof cloud.callFunction !== 'function') throw serviceError('CLOUD_UNAVAILABLE', true)
    let response
    try {
      response = await invoke(cloud, 'callFunction', {
        name: 'ciyun-ai', data: { version: 1, action, payload }, config: { timeout: 90000 }
      })
    } catch (error) { throw networkError(error) }
    const result = response && response.result
    if (!result || typeof result.ok !== 'boolean') throw serviceError('INVALID_RESPONSE', true)
    if (!result.ok) {
      const detail = result.error || {}
      const error = serviceError(detail.code, detail.retryable)
      if (typeof result.requestId === 'string') error.requestId = result.requestId
      throw error
    }
    if (!result.data || typeof result.data !== 'object') throw serviceError('INVALID_RESPONSE', true)
    return result.data
  }

  async function uploadImage(tempFilePath, purpose = 'identify') {
    if (typeof tempFilePath !== 'string' || !tempFilePath) throw serviceError('INVALID_INPUT')
    const cloud = platform && platform.cloud
    if (!cloud || typeof cloud.uploadFile !== 'function') throw serviceError('CLOUD_UNAVAILABLE', true)
    const extension = tempFilePath.split('?')[0].split('.').pop().toLowerCase()
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
    const prepared = await callAI('assets.prepareUpload', { purpose, clientRequestId: createRequestId('upload'), mimeType })
    if (typeof prepared.assetId !== 'string' || typeof prepared.cloudPath !== 'string') throw serviceError('INVALID_RESPONSE', true)
    let uploaded
    try { uploaded = await invoke(cloud, 'uploadFile', { cloudPath: prepared.cloudPath, filePath: tempFilePath }) }
    catch (error) { throw serviceError('UPLOAD_FAILED', true) }
    if (!uploaded || typeof uploaded.fileID !== 'string') throw serviceError('UPLOAD_FAILED', true)
    const confirmed = await callAI('assets.confirmUpload', { assetId: prepared.assetId, fileId: uploaded.fileID, purpose })
    if (confirmed.assetId !== prepared.assetId) throw serviceError('INVALID_RESPONSE', true)
    return { assetId: confirmed.assetId, fileId: confirmed.fileId || uploaded.fileID }
  }

  async function resolveAssets(assetIds) {
    if (!Array.isArray(assetIds) || !assetIds.length || !assetIds.every((id) => typeof id === 'string' && id)) throw serviceError('INVALID_INPUT')
    const data = await callAI('assets.resolve', { assetIds })
    if (!Array.isArray(data.assets) || data.assets.length !== new Set(assetIds).size) throw serviceError('ASSET_URL_UNAVAILABLE', true)
    if (!data.assets.every((asset) => asset && assetIds.includes(asset.assetId) && typeof asset.url === 'string' && /^https:\/\//i.test(asset.url))) throw serviceError('ASSET_URL_UNAVAILABLE', true)
    if (new Set(data.assets.map((asset) => asset.assetId)).size !== new Set(assetIds).size) throw serviceError('ASSET_URL_UNAVAILABLE', true)
    return data.assets
  }

  return { callAI, uploadImage, resolveAssets }
}

module.exports = { createCloudService, createRequestId }
