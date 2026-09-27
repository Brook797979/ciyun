Page({data:{prompt:'',generated:false},input(e){this.setData({prompt:e.detail.value})},generate(){if(this.data.prompt.trim())this.setData({generated:true})}})
