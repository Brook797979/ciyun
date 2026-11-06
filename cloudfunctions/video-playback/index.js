const cloud = require('wx-server-sdk')
const catalog = require('./catalog.json')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const byId = new Map(catalog.map(item => [item.id, item]))
const classroom = catalog.filter(item => !item.id.startsWith('ceramic-video-'))

exports.main = async (event = {}) => {
  // Omitted IDs preserve classroom playback; explicit IDs can select only fixed catalog entries.
  const ids = event && event.ids
  let selected = classroom
  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.length > catalog.length) throw new Error('Invalid video selection')
    if (ids.some(id => typeof id !== 'string' || !byId.has(id))) throw new Error('Unknown video ID')
    selected = [...new Set(ids)].map(id => byId.get(id))
  }

  let fileList
  try {
    const response = await cloud.getTempFileURL({ fileList: selected.map(item => item.fileID) })
    fileList = response && response.fileList
    if (!Array.isArray(fileList)) throw new Error('Invalid signing response')
  } catch (_) {
    throw new Error('Could not obtain video URLs')
  }
  const urls = new Map(fileList.filter((item) => item && item.tempFileURL && item.status === 0)
    .map((item) => [item.fileID, item.tempFileURL]))
  const videos = selected.map((item) => ({ id: item.id, url: urls.get(item.fileID) || '' }))
  if (videos.some((item) => !item.url)) throw new Error('Could not obtain video URLs')
  return { videos, expiresAt: Date.now() + 45 * 60 * 1000 }
}
