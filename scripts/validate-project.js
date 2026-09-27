const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const errors = []
const pageExtensions = ['js', 'json', 'wxml', 'wxss']

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`)
    return null
  }
}

function requirePath(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`缺少 ${relativePath}`)
}

const app = readJson('app.json')
readJson('project.config.json')
readJson('sitemap.json')

if (app) {
  app.pages.forEach((page) => pageExtensions.forEach((extension) => requirePath(`${page}.${extension}`)))
  const tabs = app.tabBar && app.tabBar.list ? app.tabBar.list : []
  if (tabs.length !== 5) errors.push(`Tab 数量应为 5，当前为 ${tabs.length}`)
  tabs.forEach((tab) => {
    if (!app.pages.includes(tab.pagePath)) errors.push(`Tab 页面未注册：${tab.pagePath}`)
    if (tab.iconPath) requirePath(tab.iconPath)
    if (tab.selectedIconPath) requirePath(tab.selectedIconPath)
  })
}

const componentRoot = path.join(root, 'components')
if (fs.existsSync(componentRoot)) {
  fs.readdirSync(componentRoot).forEach((name) => {
    pageExtensions.forEach((extension) => requirePath(`components/${name}/index.${extension}`))
  })
}

const patterns = require(path.join(root, 'data/patterns'))
const challenges = require(path.join(root, 'data/challenges'))
const patternIds = new Set(patterns.map((item) => item.id))
challenges.forEach((level) => {
  if (level.rewardPatternId && !patternIds.has(level.rewardPatternId)) errors.push(`关卡 ${level.id} 引用了不存在的纹样`)
})

const home = require(path.join(root, 'data/home'))
const homeImages = [
  ...home.features.map((item) => item.image),
  home.aiAssistant.image,
  ...home.videos.map((item) => item.image),
  ...home.news.map((item) => item.image)
]
homeImages.forEach((image) => requirePath(image.replace(/^\//, '')))

if (errors.length) {
  console.error(`项目校验失败（${errors.length} 项）：`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`项目校验通过：${app.pages.length} 个页面、5 个 Tab、${patterns.length} 个纹样、${challenges.length} 个关卡。`)
