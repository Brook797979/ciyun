const ceramics = require('../../data/ceramics')
const { go } = require('../../utils/navigation')
Page({ data: { filters: ['全部', '明代', '清代'], selected: '全部', ceramics }, selectFilter(e) { const selected=e.currentTarget.dataset.value; this.setData({ selected, ceramics: selected==='全部' ? ceramics : ceramics.filter((item)=>item.dynasty===selected) }) }, openDetail(e) { go(`/pages/ceramic-detail/index?id=${e.detail.id}`) } })
