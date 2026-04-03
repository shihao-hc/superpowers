import('./src/index.js').then(m => {
  m.default.listen(4000, () => {
    console.log('ShiHao Backend running on port 4000')
  })
})
