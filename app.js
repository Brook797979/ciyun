if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d7gew23w04c3def7d',
    traceUser: true
  })
}

App({
  globalData: { appName: '瓷韵', version: '0.1.0' }
})
