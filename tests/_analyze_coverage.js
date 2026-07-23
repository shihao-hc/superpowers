const fs = require('fs');
const cov = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf-8'));
const bKey = Object.keys(cov).find((k) => k.includes('BrainSystem'));
const branches = cov[bKey].b;
let uncovered = 0;
let total = 0;
Object.entries(branches).forEach(([k, v]) => {
  total++;
  if (v[0] !== v[1]) { uncovered++; console.log('Branch at line', k, ':', v[0], '/', v[1], 'covered'); }
});
console.log('Total branches:', total);
console.log('Partially uncovered:', uncovered);
console.log('Covered:', total - uncovered);
