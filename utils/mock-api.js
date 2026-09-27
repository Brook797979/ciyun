function clone(value) { return JSON.parse(JSON.stringify(value)) }

function resolve(data, delay = 120) {
  return new Promise((done) => setTimeout(() => done(clone(data)), delay))
}

module.exports = { resolve }
