const user = require('../../data/user')
const { go } = require('../../utils/navigation')
Page({ data: { user, items: [{title:'我的作品',value:user.workIds.length,url:'/pages/works/index',enabled:true},{title:'我的收藏',value:user.favoriteCeramicIds.length},{title:'已解锁纹样',value:user.unlockedPatternIds.length},{title:'成就徽章',value:user.achievements.filter((item)=>item.unlocked).length},{title:'学习记录',value:user.learningRecords.length},{title:'闯关记录',value:user.challengeRecords.length}] }, open(e){ const item=e.currentTarget.dataset.item; if(item.enabled) go(item.url) } })
