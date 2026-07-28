// Phase 7 health check for PWA assets (static checks)
const fs = require('fs');
const path = require('path');

(async () => {
  const manifestPath = path.resolve(process.cwd(), 'frontend', 'manifest.json');
  const swPath = path.resolve(process.cwd(), 'frontend', 'service-worker.js');
  const offlinePath = path.resolve(process.cwd(), 'frontend', 'offline.html');
  console.log('Phase7-health: manifest exists?', fs.existsSync(manifestPath));
  console.log('Phase7-health: service worker exists?', fs.existsSync(swPath));
  console.log('Phase7-health: offline page exists?', fs.existsSync(offlinePath));
})();
