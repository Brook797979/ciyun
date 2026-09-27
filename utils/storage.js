function get(key, fallbackValue = null) {
  const value = wx.getStorageSync(key)
  return value === '' || value === undefined ? fallbackValue : value
}

function set(key, value) {
  wx.setStorageSync(key, value)
  return value
}

module.exports = { get, set }
