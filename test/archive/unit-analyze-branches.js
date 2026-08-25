const c = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const m = Object.values(c).find((v) => v.path.includes('SemanticMemorySystem'));
if (!m.branchMap) { console.log('No branch data'); process.exit(0); }
Object.entries(m.b).forEach(([k,v]) => {
  const map = m.branchMap[k];
  const type = map.type;
  const line = map.line;
  const locations = map.locations || [];
  const taken = v.filter((x) => x > 0).length;
  const total = v.length;
  if (taken < total) {
    console.log(`Line ${line} [${type}]: ${taken}/${total} branches`);
    locations.forEach((l,i) => console.log(`  Branch ${i}: lines ${l.start}-${l.end} → ${v[i] > 0 ? 'COVERED' : 'UNCOVERED'}`));
  }
});
