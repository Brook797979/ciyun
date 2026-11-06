const source = name => `/games/assets/shapes/${name}.jpg`
const single = name => [{ src: source(name), alt: '待辨识瓷器' }]
const pair = (left, right) => [
  { src: source(left), alt: '左侧瓷器' },
  { src: source(right), alt: '右侧瓷器' }
]

const intro = [
  {
    id: 'shape-intro-shoulder',
    prompt: '观察图中的瓷器，它属于哪一种器型？',
    images: single('meiping'),
    options: ['梅瓶', '玉壶春瓶', '蒜头瓶', '双耳尊'],
    answer: 0,
    explanation: '图中为梅瓶。小口、短颈与宽圆肩部相连，腹部向下逐渐收拢。',
    hint: '看肩部是否宽圆，腹部是否向下逐渐收拢。'
  },
  {
    id: 'shape-intro-neck',
    prompt: '沿着器物轮廓观察，哪一个名称与它相符？',
    images: single('yuhuchun'),
    options: ['蒜头瓶', '梅瓶', '玉壶春瓶', '双耳尊'],
    answer: 2,
    explanation: '图中为玉壶春瓶。口沿外撇、颈部细长、腹部下垂丰满，轮廓曲线柔和。',
    hint: '从口沿向下看，留意颈部长度与腹部最宽的位置。'
  },
  {
    id: 'shape-intro-mouth',
    prompt: '请根据图片，选出这件瓷器的器型名称。',
    images: single('garlic'),
    options: ['玉壶春瓶', '蒜头瓶', '双耳尊', '梅瓶'],
    answer: 1,
    explanation: '图中为蒜头瓶。瓶口下方的头部膨起成蒜头状，再连接细长颈部与圆腹。',
    hint: '注意瓶口下方的轮廓，看看是否有明显鼓起。'
  },
  {
    id: 'shape-intro-handles',
    prompt: '看一看器身及两侧结构，它属于哪一种器型？',
    images: single('double-ear'),
    options: ['梅瓶', '瓷碗', '玉壶春瓶', '双耳尊'],
    answer: 3,
    explanation: '图中为双耳尊。颈肩两侧有对称的耳形结构，器身宽腹，造型端正。',
    hint: '先数器身两侧是否有对称的附属结构。'
  },
  {
    id: 'shape-intro-open-form',
    prompt: '观察整体形体，为图中的瓷器选一个名称。',
    images: single('bowl'),
    options: ['双耳尊', '瓷碗', '蒜头瓶', '梅瓶'],
    answer: 1,
    explanation: '图中为瓷碗。开口较宽，腹壁向下收拢，底部有圈足，整体宽而较浅。',
    hint: '比较开口与器身的宽度，再观察器身的深浅比例。'
  }
]

const advanced = [
  {
    id: 'shape-advanced-left-neck',
    prompt: '两件瓷器并列展示，请辨认左侧瓷器的器型。',
    images: pair('yuhuchun', 'meiping'),
    options: ['梅瓶', '玉壶春瓶', '蒜头瓶', '双耳尊'],
    answer: 1,
    explanation: '左侧为玉壶春瓶，口沿外撇、颈部细长、腹部丰满；右侧梅瓶的颈部短，肩部宽圆。',
    hint: '只看左图：从口沿到腹部依次观察，留意细长的颈部。'
  },
  {
    id: 'shape-advanced-symmetry',
    prompt: '观察器物轮廓，选出图中瓷器对应的名称。',
    images: single('double-ear'),
    options: ['蒜头瓶', '玉壶春瓶', '双耳尊', '梅瓶'],
    answer: 2,
    explanation: '图中为双耳尊，颈肩两侧的对称双耳是明显的识别特征。',
    hint: '除了观察口沿与腹部，也要留意两侧成对的结构。'
  },
  {
    id: 'shape-advanced-wide-opening',
    prompt: '请根据整体轮廓，选出图中瓷器的名称。',
    images: single('bowl'),
    options: ['梅瓶', '双耳尊', '玉壶春瓶', '瓷碗'],
    answer: 3,
    explanation: '图中为瓷碗，敞口、较浅的器腹与下方圈足共同构成了碗的形体。',
    hint: '把口部宽度与器身高度作比较，注意它是否具有细长的颈。'
  },
  {
    id: 'shape-advanced-left-shoulder',
    prompt: '比较两件瓷器的轮廓，请辨认左侧这一件。',
    images: pair('meiping', 'garlic'),
    options: ['梅瓶', '蒜头瓶', '双耳尊', '玉壶春瓶'],
    answer: 0,
    explanation: '左侧为梅瓶，短颈连接宽圆肩部，下腹渐收；右侧蒜头瓶的瓶口下方有膨起的头部。',
    hint: '比较左图的肩部与下腹，看宽窄如何变化。'
  },
  {
    id: 'shape-advanced-bulbous-mouth',
    prompt: '观察图中的器物，哪一个名称与它相符？',
    images: single('garlic'),
    options: ['玉壶春瓶', '梅瓶', '蒜头瓶', '双耳尊'],
    answer: 2,
    explanation: '图中为蒜头瓶。瓶口下方的头部呈蒜头状膨起，细颈之下连接圆腹。',
    hint: '先看最上方，再顺着细颈向下，留意口部附近的特殊轮廓。'
  }
]

module.exports = { intro, advanced }
