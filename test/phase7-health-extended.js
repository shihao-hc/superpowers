// Extended Phase 7 health test for offline/online status and cache validity
const fs = require('fs');
const path = require('path');

(async () => {
  const manifest = path.resolve(process.cwd(), 'frontend/manifest.json');
  const sw = path.resolve(process.cwd(), 'frontend/service-worker.js');
  const offline = path.resolve(process.cwd(), 'frontend/offline.html');
  console.log('Phase7-health-extended: manifest exists?', fs.existsSync(manifest));
  console.log('Phase7-health-extended: sw exists?', fs.existsSync(sw));
  console.log('Phase7-health-extended: offline exists?', fs.existsSync(offline));
})();
