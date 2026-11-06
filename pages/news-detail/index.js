const { resolveMedia } = require('../../utils/static-media')
const news=resolveMedia(require('../../data/news')); Page({data:{item:news[0]},onLoad(options){this.setData({item:news.find((item)=>item.id===options.id)||news[0]})}})
