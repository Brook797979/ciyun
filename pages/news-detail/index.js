const news=require('../../data/news'); Page({data:{item:news[0]},onLoad(options){this.setData({item:news.find((item)=>item.id===options.id)||news[0]})}})
