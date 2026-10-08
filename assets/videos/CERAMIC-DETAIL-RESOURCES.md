# 瓷器详情页视频资源对应表

每件瓷器只展示一条相关影像，10 件瓷器分别使用独立的视频和封面。当前尚未上传实际视频，页面显示临时封面；所有 `src` 保持为空。

视频继续使用现有微信云存储环境：`cloud1-d7gew23w04c3def7d`。

| 瓷器 ID | 瓷器名称 | 云存储上传路径 | 本地封面文件 |
| --- | --- | --- | --- |
| ceramic-001 | 青花缠枝莲纹梅瓶 | videos/ceramic-detail/ceramic-001.mp4 | assets/videos/ceramic-detail-001.jpg |
| ceramic-002 | 汝窑天青釉莲瓣碗 | videos/ceramic-detail/ceramic-002.mp4 | assets/videos/ceramic-detail-002.jpg |
| ceramic-003 | 粉彩花鸟纹瓶 | videos/ceramic-detail/ceramic-003.mp4 | assets/videos/ceramic-detail-003.jpg |
| ceramic-004 | 哥窑开片纹炉 | videos/ceramic-detail/ceramic-004.mp4 | assets/videos/ceramic-detail-004.jpg |
| ceramic-005 | 青花莲纹大盘 | videos/ceramic-detail/ceramic-005.mp4 | assets/videos/ceramic-detail-005.jpg |
| ceramic-006 | 白釉长颈瓶 | videos/ceramic-detail/ceramic-006.mp4 | assets/videos/ceramic-detail-006.jpg |
| ceramic-007 | 三彩凤首壶 | videos/ceramic-detail/ceramic-007.mp4 | assets/videos/ceramic-detail-007.jpg |
| ceramic-008 | 龙泉窑青釉双耳炉 | videos/ceramic-detail/ceramic-008.mp4 | assets/videos/ceramic-detail-008.jpg |
| ceramic-009 | 青花云龙纹罐 | videos/ceramic-detail/ceramic-009.mp4 | assets/videos/ceramic-detail-009.jpg |
| ceramic-010 | 斗彩鸡缸杯 | videos/ceramic-detail/ceramic-010.mp4 | assets/videos/ceramic-detail-010.jpg |

## 如何替换

1. 在微信开发者工具的云开发控制台中，将各自的 MP4 上传到表中对应路径。
2. 把封面文件放入表中指定的项目目录；这些 JPG 文件尚未创建，`coverResourcePath` 仅预留名称。
3. 在 `data/ceramics.js` 对应瓷器的 `createDetailVideo(...)` 最后一个参数中，填写本件瓷器的 `cover` 和云存储返回的真实文件 ID `src`。

例如，第一件瓷器的参数为：

```js
{
  cover: '/assets/videos/ceramic-detail-001.jpg',
  src: '上传后返回的真实 cloud:// 文件 ID'
}
```

同时按实际素材更新这一件的标题、简介与时长。每件瓷器独立配置，替换一件不会改变其他件。

详情页当前完成的是封面展示、播放按钮外观与资源数据预留。真实视频的加载、播放交互及云文件地址解析将在提供素材后接入。
