// Phase Summary: simple smoke test to ensure phase summary can be read and exported
(async () => {
  try {
    const fs = require('fs')
    const path = require('path')
    const src = path.resolve(__dirname, '../../docs/phase-summary.md')
    const dst = path.resolve(__dirname, '../../docs/phase-summary-final.md')
    const content = fs.readFileSync(src, 'utf8')
    fs.writeFileSync(dst, content + '\n\nGenerated: ' + new Date().toISOString(), 'utf8')
    console.log('Exported phase summary to phase-summary-final.md')
    process.exit(0)
  } catch (e) {
    console.error('Export phase summary test failed', e)
    process.exit(1)
  }
})()
