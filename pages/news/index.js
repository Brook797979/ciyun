const news=require('../../data/news'); const {go}=require('../../utils/navigation'); Page({data:{news},open(e){go(`/pages/news-detail/index?id=${e.currentTarget.dataset.id}`)}})
