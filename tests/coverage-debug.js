const path = require('path');
const c = require(path.join(__dirname, '..', 'coverage-agent-loop.json'));
const cm = c.coverageMap;
const keys = Object.keys(cm);
console.log('Files in coverageMap:', keys.length);
for (const k of keys) {
  console.log('  -', k);
  const f = cm[k];
  if (f && f.branchMap) {
    console.log('    Branches:', Object.keys(f.branchMap).length);
    let uncovered = 0;
    for (const [id, b] of Object.entries(f.branchMap)) {
      const hits = f.b[id];
      let cov = 0, tot = 0;
      if (b.type === 'if') {
        tot = 2;
        cov = (hits[0] > 0 ? 1 : 0) + (hits[1] && hits[1] > 0 ? 1 : 0);
      } else if (b.type === 'binary-expr') {
        tot = b.locations.length;
        for (let i = 0; i < tot; i++) if (hits[i] > 0) cov++;
      } else if (b.type === 'cond-expr') {
        tot = 2;
        cov = (hits[0] > 0 ? 1 : 0) + (hits[1] > 0 ? 1 : 0);
      } else {
        tot = b.locations.length;
        for (let i = 0; i < tot; i++) if (hits[i] > 0) cov++;
      }
      if (cov < tot) {
        const loc = b.locations[0] || {};
        const start = loc.start ? 'L' + loc.start.line : '?';
        console.log('    UNCOV', b.type, start, id, '[' + cov + '/' + tot + ']');
        uncovered++;
      }
    }
    console.log('    Uncovered branches:', uncovered);
  }
}
