const { mediaUrl } = require('./static-media')

function isPrivateAI(work) {
  return work && work.creationType === 'ai' && work.source !== 'showcase'
}

function createWorkViews(works) {
  return (Array.isArray(works) ? works : []).map(work => ({
    ...work,
    image: isPrivateAI(work) ? '' : mediaUrl(work.image),
    imageLoading: isPrivateAI(work) && Boolean(work.assetId),
    imageUnavailable: isPrivateAI(work) && !work.assetId,
    creationLabel: work.source === 'showcase' ? '展示案例' : work.creationType === 'ai' ? 'AI创瓷' : '数字制瓷',
    displayDate: typeof work.createdAt === 'string' ? work.createdAt.slice(0, 10).replace(/-/g, '.') : ''
  }))
}

async function resolveWorkViews(works, resolveAssets) {
  const views = createWorkViews(works)
  const ids = [...new Set(views.filter(isPrivateAI).map(item => item.assetId).filter(id => typeof id === 'string' && id))]
  const resolved = new Map()
  for (let offset = 0; offset < ids.length; offset += 20) {
    try {
      const assets = await resolveAssets(ids.slice(offset, offset + 20))
      if (!Array.isArray(assets)) continue
      for (const asset of assets) {
        if (asset && typeof asset.assetId === 'string' && typeof asset.url === 'string' && asset.url.startsWith('https://')) {
          resolved.set(asset.assetId, asset)
        }
      }
    } catch (error) {
      // Preserve local metadata even when private image links cannot be refreshed.
    }
  }
  return views.map(work => {
    if (!isPrivateAI(work)) return work
    const asset = resolved.get(work.assetId)
    return {
      ...work,
      image: asset ? asset.url : '',
      imageExpiresAt: asset && asset.expiresAt || 0,
      imageLoading: false,
      imageUnavailable: !asset
    }
  })
}

module.exports = { createWorkViews, resolveWorkViews, isPrivateAI }
