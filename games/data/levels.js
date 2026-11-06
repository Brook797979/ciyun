const questions = require('./questions')
const shapeQuestions = require('./shape-questions')
const challengeGames = require('../../data/challenge-games')
const connectionRules = require('./link-rules')

const symbols = ['lotus', 'cloud', 'leaf', 'wave', 'flower', 'bird', 'fish', 'bamboo', 'butterfly', 'coin']
const art = '/games/assets/art/'

module.exports = {
  'level-001': {
    ...challengeGames['level-001'],
    instruction: '交换相邻纹样，分别收集12枚莲纹和12枚祥云',
    goal: '收集指定纹样', total: 24, unit: '枚',
    story: '让莲纹与祥云在青花之间相逢。',
    rules: '点选相邻的两枚纹样交换位置。三个或更多相同纹样连成一线即可消除；在22步内收集12枚莲纹和12枚祥云。未形成消除的交换不扣步。',
    rows: 6, cols: 6, moves: 22, target: 24, targets: { lotus: 12, cloud: 12 }, symbols: symbols.slice(0, 5)
  },
  'level-002': {
    ...challengeGames['level-002'],
    instruction: '点选相同纹样，连线最多转两次弯',
    goal: '配对纹样', total: 18, unit: '对',
    story: '花鸟鱼竹，各有彼此呼应的图案。',
    rules: connectionRules.join(''), connectionRules,
    rows: 6, cols: 6, symbols: symbols.slice(0, 9)
  },
  'level-003': {
    ...challengeGames['level-003'],
    instruction: '交换十六块图案，还原瓷器静物',
    goal: '归位图块', total: 16, unit: '块',
    story: '一瓶一盏，在拼合中还原安静的瓷韵。',
    rules: '点选任意两块图案交换位置，将十六块图案还原成完整的瓷器静物画面。全部图块归位即可通关。',
    rows: 4, cols: 4, image: `${art}puzzle-still-life.jpg`
  },
  'level-004': {
    ...challengeGames['level-004'],
    instruction: '观察器物轮廓，选出对应的器型名称',
    goal: '答对题数', total: 5, unit: '题',
    story: '从口沿、颈肩到腹足，认出瓷器的形体。',
    rules: '本关五道图片题，每题只有一个正确答案。观察器物轮廓，选择对应器型；答对至少四题即可通关。',
    questions: shapeQuestions.intro, minCorrect: 4
  },
  'level-005': {
    ...challengeGames['level-005'],
    instruction: '每题选择一个答案，作答后查看解析',
    goal: '答对题数', total: 5, unit: '题',
    story: '从青花、釉彩与器型，认识瓷器的基本语言。',
    rules: '本关五道题，每题只有一个正确答案。作答后阅读解释，再进入下一题；答对至少四题即可通关。',
    questions: questions.intro, minCorrect: 4
  },
  'level-006': {
    ...challengeGames['level-006'],
    instruction: '分别收集10枚莲纹、10枚花卉和10枚飞鸟',
    goal: '收集指定纹样', total: 30, unit: '枚',
    story: '莲花舒展，飞鸟轻鸣，纹样在瓷上相聚。',
    rules: '点选相邻纹样交换位置，三个或更多相同纹样连成一线即可消除。在24步内分别收集10枚莲纹、10枚花卉和10枚飞鸟。未形成消除的交换不扣步。',
    rows: 6, cols: 6, moves: 24, target: 30, targets: { lotus: 10, flower: 10, bird: 10 }, symbols: symbols.slice(0, 6)
  },
  'level-007': {
    ...challengeGames['level-007'],
    instruction: '交换十六块图案，还原制瓷工坊的一角',
    goal: '归位图块', total: 16, unit: '块',
    story: '窑火之外，工作台上也藏着制瓷的日常。',
    rules: '点选任意两块图案交换位置，将十六块图案还原成完整的制瓷工坊画面。全部图块归位即可通关。',
    rows: 4, cols: 4, puzzleHeight: 840, image: `${art}puzzle-workshop.jpg`
  },
  'level-008': {
    ...challengeGames['level-008'],
    instruction: '看清题目指定的一件，比较轮廓并辨认器型',
    goal: '答对题数', total: 5, unit: '题',
    story: '并列观察器形差别，读懂轮廓中的线索。',
    rules: '本关五道图片题，每题只有一个正确答案。遇到两件器物并列展示时，辨认题目指定的一侧；答对至少四题即可通关。',
    questions: shapeQuestions.advanced, minCorrect: 4
  },
  'level-009': {
    ...challengeGames['level-009'],
    instruction: '找到相同纹样，用最多两次转弯的连线配对',
    goal: '配对纹样', total: 18, unit: '对',
    story: '纹饰虽多，仍能找到相互呼应的线索。',
    rules: connectionRules.join(''), connectionRules,
    rows: 6, cols: 6, symbols: symbols.slice(0, 9)
  },
  'level-010': {
    ...challengeGames['level-010'],
    instruction: '观察纹饰与工艺，选择正确答案',
    goal: '答对题数', total: 5, unit: '题',
    story: '再看器型与釉彩，把观察变成清楚的认识。',
    rules: '本关五道题，每题只有一个正确答案。作答后阅读解释，再进入下一题；答对至少四题即可通关。',
    questions: questions.advanced, minCorrect: 4
  },
  'level-011': {
    ...challengeGames['level-011'],
    instruction: '交换相邻纹样，在18步内累计消除60枚',
    goal: '累计消除纹样', total: 60, unit: '枚',
    story: '让熟悉的青花纹样，连成一段流动的韵律。',
    rules: '点选相邻的两枚纹样交换位置。三个或更多相同纹样连成一线即可消除，在18步内累计消除60枚任意纹样即可通关。未形成消除的交换不扣步。',
    rows: 6, cols: 6, moves: 18, target: 60, symbols: symbols.slice(0, 6)
  },
  'level-012': {
    ...challengeGames['level-012'],
    instruction: '交换十六块图案，还原青花山水',
    goal: '归位图块', total: 16, unit: '块',
    story: '远山、流水与瓷上留白，在拼合中相连。',
    rules: '点选任意两块图案交换位置，将十六块图案还原成完整的青花山水画面。全部图块归位即可通关。',
    rows: 4, cols: 4, image: `${art}puzzle-landscape.jpg`
  }
}
