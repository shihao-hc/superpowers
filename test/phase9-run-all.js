// Phase 9 aggregate run-all patch (health + end-to-end)
(async () => {
  const tests = [
    'node test/phase9-health-test.js',
    'node test/phase9-health-extended.js',
    'node test/phase9-end-to-end-test.js'
  ];
  console.log('Phase9-run-all: running basic health and end-to-end tests');
  for (const t of tests) {
    try {
      console.log('Running:', t);
      // eslint-disable-next-line no-eval
      await new Function('require', 'console', `return require('${t}')`)(require, console);
    } catch (e) {
      console.error('Phase9-run-all error:', e.message);
    }
  }
})();
