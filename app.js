const { enableCloudMedia } = require('./utils/static-media')

if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d7gew23w04c3def7d',
    traceUser: true
  })
  enableCloudMedia()
}

App({
  globalData: { appName: '瓷韵', version: '0.1.0' },
  onShow() {
    try { require('./utils/growth-progress').createGrowthProgress(wx).recordVisit() }
    catch (_) { /* Visit bookkeeping must not prevent the app from opening. */ }
  }
})
