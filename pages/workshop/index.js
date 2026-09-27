const { go } = require('../../utils/navigation')
Page({ data: { entries: [{ title:'数字制瓷',description:'四步完成陶瓷设计',url:'/pages/craft/index' },{ title:'AI创瓷',description:'用文字描述创作灵感',url:'/pages/ai-create/index' },{ title:'我的作品',description:'查看已保存的数字作品',url:'/pages/works/index' }] }, open(e){ go(e.currentTarget.dataset.url) } })
