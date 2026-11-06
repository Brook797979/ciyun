# 四种器型补充预览

为花瓶、蒜头瓶、瓷碗和双耳尊补齐现有六种纹样、六种釉色，共144种固定视角组合。梅瓶、玉壶春瓶的原72张预览及原制作清单保持不变。

## 素材与方法

- 底图沿用 `assets/shapes/{shape}.jpg`，纹样沿用 `../two-vessel-v2/textures` 的原青花颜料层。
- `geometry.json` 记录四种器型的轮廓、贴纹区域及检查裁切框。花瓶、蒜头瓶采用手工校准轮廓；瓷碗的纹样限制在外壁；双耳尊的双耳参与换釉色，耳孔保留原背景。
- `vessel_surfaces.py` 复用原曲面映射的主体轮廓，补充双耳、镂空和外壁贴纹范围。
- `build_assets.py` 复用现有明暗、高光与釉色合成公式，釉色参数直接读取 `data/glazes.js`，不调用图像生成服务。
- 这是固定视角的数字预览，不提供自由旋转或真实烧制模拟。

## 输出

24张白釉预览写入 `assets/craft/two-vessel-v2/{shape}/{pattern}-preview.jpg`，960×540；120张其他釉色写入 `assets/craft/glazes-v1/{shape}/{pattern}-{glaze}.jpg`，800×450。命名与原两种器型一致。

`{shape}/layers/` 保存器身与贴纹蒙版、近似明暗、高光和六种贴合纹样。`manifest.json` 保存源文件及输出哈希、144种组合路径和背景检查结果。运行图片由静态托管提供，并列在 `utils/static-media-manifest.js` 和配套JSON中；新增图片必须先上传再更新小程序。

## 重建与检查

在项目根目录运行，Python需有Pillow和NumPy，Node用于读取实际目录数据：

```powershell
python design-assets/craft/remaining-v1/build_assets.py --review-dir 检查图目录 --node node
python -m unittest discover -s design-assets/craft/remaining-v1 -p test_remaining.py
node --test tests/craft-preview.test.js tests/craft-pattern.test.js tests/craft-finish.test.js tests/static-media.test.js
```

构建会检查导出图层的白瓷重建误差、器身蒙版外像素不变及JPEG缩放后远离蒙版区域的背景不变。输出四张36组合检查图供人工审查。页面、草稿、作品记录和挑战解锁沿用原流程。
