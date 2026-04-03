const path = require('path');
const { PersonalityManager } = require('../src/personality/PersonalityManager');

(async () => {
  const dataPath = path.resolve(__dirname, '..', 'data', 'personalities.json');
  const pm = new PersonalityManager(dataPath);
  await pm.load();
  const okSet = pm.setActive('狐九');
  const prompt = pm.getSystemPrompt();

  console.log('Phase1 Test:');
  console.log('- active set:', okSet);
  console.log('- system prompt:', prompt);

  const testsPassed = okSet && typeof prompt === 'string' && prompt.length > 0;
  console.log('Phase 1 tests', testsPassed ? 'PASSED' : 'FAILED');
  process.exit(testsPassed ? 0 : 1);
})();
