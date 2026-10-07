const cloud = require('wx-server-sdk')
const catalog = require('./catalog.json')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  // Only these ten classroom videos can be signed; callers cannot supply arbitrary storage paths.
  const { fileList = [] } = await cloud.getTempFileURL({ fileList: catalog.map((item) => item.fileID) })
  const urls = new Map(fileList.filter((item) => item.tempFileURL && item.status === 0)
    .map((item) => [item.fileID, item.tempFileURL]))
  const videos = catalog.map((item) => ({ id: item.id, url: urls.get(item.fileID) || '' }))
  if (videos.some((item) => !item.url)) throw new Error('Could not obtain classroom video URLs')
  return { videos, expiresAt: Date.now() + 45 * 60 * 1000 }
}
