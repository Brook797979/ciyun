function filterCeramics(items, keyword = '', dynasty = '全部') {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return items.filter((item) => {
    if (dynasty !== '全部' && item.dynasty !== dynasty) return false
    if (!normalizedKeyword) return true

    const searchableText = [
      item.name,
      item.dynasty,
      item.shape,
      item.pattern,
      item.craft,
      ...(item.keywords || [])
    ].filter(Boolean).join(' ').toLowerCase()

    return searchableText.includes(normalizedKeyword)
  })
}

module.exports = filterCeramics
