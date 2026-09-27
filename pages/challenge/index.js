const levels = require('../../data/challenges')
const { go } = require('../../utils/navigation')
Page({ data: { levels }, openLevel(e){ const item=e.currentTarget.dataset.item; if(item.status!=='locked') go(`/pages/game/index?id=${item.id}`) } })
