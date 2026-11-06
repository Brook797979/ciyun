const messages = {
  UNAUTHENTICATED: '请从小程序内发起请求', INVALID_REQUEST: '请求格式不正确', INVALID_ACTION: '不支持的操作',
  INVALID_INPUT: '输入内容不正确', NOT_FOUND: '资源不存在或无权访问', INVALID_ASSET: '图片资源不符合要求',
  INVALID_IMAGE: '仅支持不超过5MiB的JPEG、PNG或WebP图片', IDEMPOTENCY_CONFLICT: '该请求编号已用于不同内容',
  GENERATION_IN_PROGRESS: '已有创作正在处理中，请等待完成', MODEL_NOT_CONFIGURED: 'AI服务尚未配置，请联系管理员',
  MODEL_INVALID_RESPONSE: 'AI返回内容格式异常，请稍后重试', MODEL_TIMEOUT: 'AI请求超时，结果暂时未知',
  RESULT_UNKNOWN: '请求结果暂时未知，请勿重复提交', MODEL_ERROR: 'AI服务暂时不可用', STORAGE_ERROR: '图片保存暂时失败',
  STORAGE_NOT_CONFIGURED: '云存储环境尚未配置', INVALID_RESULT_URL: '生成图片来源不符合要求', INTERNAL_ERROR: '服务暂时不可用'
}
function error(code, retryable = false, ambiguous = false) {
  const result = new Error(messages[code] || messages.INTERNAL_ERROR)
  result.code = code
  result.retryable = retryable
  result.ambiguous = ambiguous
  return result
}
function safeError(cause) {
  const code = messages[cause?.code] ? cause.code : 'INTERNAL_ERROR'
  return { code, message: messages[code], retryable: Boolean(cause?.retryable) }
}
module.exports = { error, safeError }
