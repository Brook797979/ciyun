const tabRoutes = new Set(['/pages/home/index', '/pages/museum/index', '/pages/workshop/index', '/pages/challenge/index', '/pages/profile/index'])

function go(url) {
  if (!url) return Promise.reject(new Error('页面地址不能为空'))
  return tabRoutes.has(url) ? wx.switchTab({ url }) : wx.navigateTo({ url })
}

module.exports = { go, tabRoutes }
