const points = {
  visit: 2,
  ceramic_viewed: 2,
  identify_completed: 8,
  chat_answered: 3,
  work_created: 15,
  challenge_completed: 20
}

const levels = [
  { level: 1, title: '初识瓷韵', minXp: 0 },
  { level: 2, title: '青瓷研习者', minXp: 50 },
  { level: 3, title: '青花知音', minXp: 150 },
  { level: 4, title: '窑火行者', minXp: 300 },
  { level: 5, title: '瓷艺雅士', minXp: 500 },
  { level: 6, title: '瓷韵传习者', minXp: 800 },
  { level: 7, title: '瓷境宗师', minXp: 1200 }
]

const masterRequirements = [
  { stat: 'totalXp', target: 1200 },
  { stat: 'exploredDays', target: 14 },
  { stat: 'digitalWorks', target: 10 },
  { stat: 'aiWorks', target: 5 },
  { stat: 'identifications', target: 20 },
  { stat: 'answers', target: 30 },
  { stat: 'viewedCeramics', target: 10 }
]
const conditionFor = {
  totalXp: target => `成长值达到${target}`,
  exploredDays: target => `实际探索${target}天`,
  digitalWorks: target => `保存${target}件本人手作作品`,
  aiWorks: target => `保存${target}件本人生成的AI作品`,
  identifications: target => `完成${target}次有效陶瓷文化解读`,
  viewedCeramics: target => `浏览${target}件不同馆藏器物详情`,
  answers: target => `完成${target}轮陶瓷知识问答`
}
const badges = [
  { id: 'master', name: '瓷境宗师', requirements: masterRequirements, target: masterRequirements.length },
  { id: 'craft', name: '匠心巧手', stat: 'digitalWorks', target: 10 },
  { id: 'creator', name: '灵感造物师', stat: 'aiWorks', target: 5 },
  { id: 'identify', name: '慧眼识珍', stat: 'identifications', target: 20 },
  { id: 'scholar', name: '博古知瓷', stat: 'viewedCeramics', target: 10 },
  { id: 'inquiry', name: '问瓷求真', stat: 'answers', target: 30 }
].map(badge => ({
  ...badge,
  condition: (badge.requirements || [badge]).map(({ stat, target }) => conditionFor[stat](target)).join('，'),
  image: `/assets/profile/${badge.id}.png`
}))

module.exports = {
  points,
  eventPoints: points,
  levels,
  badges,
  identityImage: '/assets/profile/identity-landscape.png',
  journalLimit: 20,
  journalDisplayLimit: 5
}
