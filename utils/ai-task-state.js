const ACTIVE_TASK_KEY = 'aiGenerationActive'

function validState(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.clientRequestId === 'string' && value.clientRequestId
    && value.input && typeof value.input.userPrompt === 'string' && typeof value.input.styleId === 'string'
}

function createTaskState(platform) {
  function read() {
    const value = platform.getStorageSync(ACTIVE_TASK_KEY)
    return validState(value) ? { ...value, input: { ...value.input } } : null
  }
  function write(value) {
    if (!validState(value)) throw new Error('任务信息不完整')
    const snapshot = { ...value, input: { ...value.input }, updatedAt: new Date().toISOString() }
    platform.setStorageSync(ACTIVE_TASK_KEY, snapshot)
    return snapshot
  }
  return { read, write }
}

function confirmUnknownCreation(platform) {
  if (!platform || typeof platform.showModal !== 'function') return Promise.resolve(false)
  return new Promise((resolve) => {
    const finish = (result) => resolve(Boolean(result && result.confirm))
    try {
      const pending = platform.showModal({
        title: '再次生成提示',
        content: '上次生成结果尚未确认，再次生成可能额外计费',
        confirmText: '仍要新建', cancelText: '继续查询',
        success: finish, fail: () => resolve(false)
      })
      if (pending && typeof pending.then === 'function') pending.then(finish, () => resolve(false))
    } catch (error) { resolve(false) }
  })
}

module.exports = { createTaskState, ACTIVE_TASK_KEY, confirmUnknownCreation }
