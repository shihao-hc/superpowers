// Phase 10 aggregated end-to-end tests
(async () => {
  const tests = [
    'node test/phase9-health-test.js',
    'node test/phase9-health-extended.js',
    'node test/phase9-end-to-end-test.js',
    'node test/phase10-end-to-end-test.js'
  ];
  console.log('Phase10-run-all: running end-to-end health & edge tests');
  for (const t of tests) {
    try {
      console.log('Running:', t);
      // dynamic require pattern to execute test file in current context
      await new Function('require', 'console', `return require('${t}')`)(require, console);
    } catch (e) {
      console.error('Phase10-run-all error:', e.message);
    }
  }
})();
