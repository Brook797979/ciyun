Page({data:{steps:['选择器型','搭配纹样','选择釉色','生成作品'],current:0},next(){this.setData({current:Math.min(this.data.current+1,this.data.steps.length-1)})}})
