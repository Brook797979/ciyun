# 工坊卡片图片

数字制瓷和我的作品的背景通过内置图像生成工具生成，原始 PNG 保留在 Codex generated_images 目录。项目使用保持构图的 1200px 宽 JPEG（质量 88），控制小程序资源体积。

- `digital-craft.jpg`：绘瓷过程，用于数字制瓷入口。
- `ai-creation-reference.jpg`：用户设计图中现成的青花花瓶与淡蓝环绕画面，用于 AI 创瓷入口，不是重新生成的图片。
- `ai-creation.jpg`：旧版异形陶瓷背景，已停止使用，保留原文件。
- `my-works.jpg`：花瓶、青瓷碗和盖罐陈列，用于我的作品入口。

仅提供无文字背景，标题、说明与按钮均为小程序原生布局。

## 用户设计图素材提取

2026-10-08 按用户要求直接使用第二张卡片现成画面。来源为用户提供的 `codex-clipboard-97900fff-2bbd-4f9a-991a-c2dcdf9e2750.png`（941×1672px）；仅裁剪右侧无文字图片区域 x=425、y=790、width=487、height=373，保存为 `ai-creation-reference.jpg`（JPEG 质量 95）。没有生成、重绘或改变花瓶造型。页面将这张图放在卡片右侧，左侧文字仍为可编辑的原生布局。

## 最终生成提示词

### craft

Use case: product-mockup. Asset type: one full-bleed landscape photographic banner for the Chinese ceramics mobile app 瓷韵. Output a single image, wide panoramic composition approximately 1536x640, roughly 2.4:1. This is background artwork only, NO typography, NO letters, NO UI, NO icons, NO borders, NO collage. Style: premium realistic ceramic material blended with delicate Chinese ink-wash mountains and warm ivory silk-paper texture. Palette: cobalt blue #0B4162, porcelain white, warm parchment #F8F1E6, restrained gold. LEFT 48 percent is almost empty softly textured cream parchment, only faint low-contrast watercolor mountains along the lower edge, kept very light for dark live UI text. RIGHT 50 percent is the subject; a gentle seamless transition joins the cream left and photographic right. The entire subject should fit in the right half with small margins above and below so it stays visible in a wide mobile card crop. Natural soft warm light, refined museum/craft atmosphere, crisp ceramic glaze, no people except any specifically requested hand, no watermarks. Subject: a single elegant ivory-white ceramic vase on a round wooden pottery wheel, cobalt floral branches partially hand-painted on its belly. A realistically proportioned human hand enters only from the far right holding a fine bamboo brush against a blue flower on the vessel. Emphasize the tangible act of painting ceramic and wood textures. Behind the right-side subject: softly blurred warm traditional ceramics studio, subtle plum blossom bokeh. Vase silhouette fully visible, not cut off.

### ai

Use case: product-mockup. Asset type: one full-bleed landscape photographic banner for the Chinese ceramics mobile app 瓷韵. Output a single image, wide panoramic composition approximately 1536x640, roughly 2.4:1. This is background artwork only, NO typography, NO letters, NO UI, NO icons, NO borders, NO collage. Style: premium realistic ceramic material blended with delicate Chinese ink-wash mountains and warm ivory silk-paper texture. Palette: cobalt blue #0B4162, porcelain white, warm parchment #F8F1E6, restrained gold. LEFT 48 percent is almost empty softly textured cream parchment, only faint low-contrast watercolor mountains along the lower edge, kept very light for dark live UI text. RIGHT 50 percent is the subject; a gentle seamless transition joins the cream left and photographic right. The entire subject should fit in the right half with small margins above and below so it stays visible in a wide mobile card crop. Natural soft warm light, refined museum/craft atmosphere, crisp ceramic glaze, no people except any specifically requested hand, no watermarks. Subject: an original sculptural contemporary ceramic vase with subtly asymmetric fluted form, glossy ivory glaze decorated with free-flowing cobalt-blue wave and mountain patterns, on a understated round wooden pedestal. A delicate translucent pale-blue ribbon curves around it to imply creative generation, restrained and elegant, no neon, no holographic UI. This vase must look distinctly different from a conventional floral meiping vase. Background on the right: dark muted blue gallery with a few white plum blossoms in upper-right corner. Vase and swirling ribbon fully visible.

### works

Use case: product-mockup. Asset type: one full-bleed landscape photographic banner for the Chinese ceramics mobile app 瓷韵. Output a single image, wide panoramic composition approximately 1536x640, roughly 2.4:1. This is background artwork only, NO typography, NO letters, NO UI, NO icons, NO borders, NO collage. Style: premium realistic ceramic material blended with delicate Chinese ink-wash mountains and warm ivory silk-paper texture. Palette: cobalt blue #0B4162, porcelain white, warm parchment #F8F1E6, restrained gold. LEFT 48 percent is almost empty softly textured cream parchment, only faint low-contrast watercolor mountains along the lower edge, kept very light for dark live UI text. RIGHT 50 percent is the subject; a gentle seamless transition joins the cream left and photographic right. The entire subject should fit in the right half with small margins above and below so it stays visible in a wide mobile card crop. Natural soft warm light, refined museum/craft atmosphere, crisp ceramic glaze, no people except any specifically requested hand, no watermarks. Subject: a curated collection of three different ceramic artworks arranged together on a warm wooden display shelf in the right half: a tall slim blue-and-white floral vase behind, a low celadon bowl in front-left of the vase, and a small rounded ivory lidded jar with cobalt geometric patterns in front-right. Make all three works visible, distinct shapes, carefully balanced composition. Background on right: softly blurred circular wooden window and white plum blossom branch. This is a personal collection display, calm and polished, no brush or hand, no floating effects.
