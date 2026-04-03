// Stage B: basic Python environment creation test
const path = require('path');
const { PythonEnvManager } = require('../src/performance/PythonEnvManager');

(async () => {
  const pm = new PythonEnvManager({ mockMode: true });
  const skillName = 'demo-stageB';
  try {
    const env = await pm.ensureEnvironment(skillName, []);
    console.log('Stage B: created python env at', env);
  } catch (e) {
    console.error('Stage B: env creation failed', e.message);
  }
})();
