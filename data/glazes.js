const glaze = (id, name, shortName, description, color, unlocked) => ({
  id: `glaze-${id}`,
  name,
  shortName,
  description,
  image: `/assets/craft/glazes-v1/cards/${id}.jpg`,
  color,
  unlocked
})

// This palette is also read by the offline glaze asset builder.
module.exports = [
  glaze('white', '青花白釉', '白釉', '温润清透，青花澄净', '#ffffff', true),
  glaze('sky', '天青釉', '天青', '浅青含蓝，莹润如水', '#b3d9d9', true),
  glaze('bean', '豆青釉', '豆青', '柔和青绿，釉面温润', '#99c4a8', false),
  glaze('rice', '暖米釉', '暖米', '暖米柔光，细腻古雅', '#e8cfa3', false),
  glaze('cobalt', '霁蓝釉', '霁蓝', '沉静深蓝，釉光含蓄', '#3666ab', false),
  glaze('rouge', '胭脂红釉', '胭脂红', '胭脂含紫，莹润柔亮', '#b8526b', false)
]
