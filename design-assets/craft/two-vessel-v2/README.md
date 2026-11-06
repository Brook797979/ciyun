# 两种器型 × 六种新纹理

本目录维护梅瓶、玉壶春瓶的六种纹样预览及离线制作图层。纹样的默认开放与挑战解锁条件由小程序目录数据控制；六种固定釉色的组合素材由相邻的 `glazes-v1` 目录生成。

## 来源

两张白瓷底图直接复制自 `assets/shapes/{shape}.jpg`，1200×675，不改变原图。这两张是既有生成式场景素材，并非馆藏实物照片。本轮没有生成新纹理或新瓶型。

六张用户提供的透明纹理来自桌面 `资源/纹理图`，均为原生 1254×1254 RGBA。完整副本在 `inputs`，原始文件名及 SHA-256 见 `manifest.json`。

| 纹样 | 原始文件名开头 |
|---|---|
| 青花莲纹 lotus | 69f799a9 |
| 祥云 cloud | f4e0425e |
| 花鸟 flower-bird | 3e836b71 |
| 山水 landscape | 42bdf596 |
| 缠枝莲 scroll-lotus | cdfbe6b8 |
| 瑞兽 beast | 8ee4a5fc |

将源图明度转换为独立青花覆盖度，保留细节深浅；源图的白色转为露出底釉的留白，色相统一为克制的钴蓝。原始 RGB/alpha 完整保留，可重新调整颜料转换参数。与旧样板约200像素的UI裁片相比，本轮使用新的原生细节，未宣称放大产生新细节。

## 结构与坐标

- `inputs/`：两张原白瓷及六张原始纹理。
- `textures/*-pigment.png`：1254×1254 的透明青花颜料层，尚未贴合器身。
- `geometry.json`：两种器型的逐行左右轮廓、主纹样区域、细线、曲率和检查裁切框。
- `{shape}/layers/body-mask.png`：灰度器身蒙版。
- `{shape}/layers/glaze-base.png`：白色底釉及器身透明度。
- `{shape}/layers/*-wrapped.png`：已经贴合器型的透明颜料层。
- `{shape}/layers/diffuse-shading.png`：近似漫反射明暗；alpha为器身蒙版。
- `{shape}/layers/specular-highlights.png`：白色高光，alpha为高光强度。
- `{shape}/masters/*-white.png`、`lotus-celadon.png`：无损合成母版与浅青釉证明。
- `manifest.json`：原始来源、哈希、参数、误差与预览映射。

所有器身图层与母版统一1200×675、同一原点；只有未贴合的原始纹理是1254×1254。运行时预览为等比960×540 JPG，卡片为384×360的128色PNG。等比缩放保持原场景与现有预览的构图关系，制作母版不缩小。

## 贴合与换釉色

每行根据瓶身半径做 arcsin 弧度映射，纹样在侧面压缩，无左右透明渐隐。梅瓶使用较高的腹部区域；玉壶春使用圆腹、保留细颈。轮廓微调只搜索手工描线附近的边缘梯度，内部暖色阴影不参与轮廓判断；对应回归测试防止横向缺口再次出现。

颜色为0–1，计算在sRGB数值空间进行。设 M=器身蒙版，A=贴合颜料alpha，P=clip(A/M,0,1)，M=0处P=0；D为明暗RGB，H为高光alpha，G为底釉RGB，C为青花RGB=(21,57,106)/255：

```text
材质底色 = G × (1 − P) + C × P
瓷器颜色 = 材质底色 × D × (1 − H) + H
最终图像 = 原白瓷照片 × (1 − M) + 瓷器颜色 × M
```

这些图层应按上述公式使用，不是依次普通透明叠加。换底釉仅改 G，不重新绘制或拉伸纹样；默认白釉 G=(1,1,1)，浅青釉证明 G=(0.75,0.87,0.82)。本轮从**实际导出的8位图层**重读合成，而非只验证内存中浮点数据。白釉无纹样重建最大误差小于1/255，十二张无损母版的蒙版外像素变化为0。JPG运行时图有压缩和等比缩小误差，不能作像素相等声明。

单张照片的明暗/高光分解是视觉近似，不是测量PBR材质，也不表示支持自由视角或复杂烧制模拟。小程序使用的固定釉色组合复用这些图层，制作方法见 `../glazes-v1/README.md`。

## 重建与验证

依赖 Python、Pillow、NumPy；检查图字体使用Windows微软雅黑。项目根目录执行：

```powershell
python design-assets/craft/two-vessel-v2/build_assets.py --review-dir '检查图输出目录'
python -m unittest discover -s design-assets/craft/two-vessel-v2 -p test_geometry.py
npm test
npm run validate
```

可用 `--runtime-dir` 显式指定小程序运行图目录。默认写入 `assets/craft/two-vessel-v2`。`data/patterns.js` 已接入十二张预览和六张卡片，`pages/craft/index.wxml` 现有 `previewImages` 分支负责显示；SVG仍作为旧器型兼容回退。

`design-assets` 已由 `project.config.json` 排除打包。默认纹样使用 v2 映射；旧 `meiping-v1` 制作源和本地样板已移入项目外的清理备份。旧作品使用的图片 URL 仍由静态媒体清单的 `legacyFiles` 映射到原 CDN，不能删除这些线上兼容资源。离线素材检查不能代替微信真机视觉验收。
