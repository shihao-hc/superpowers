const { IntegrationTestRunner, runner } = require('../../src/integration/IntegrationTests');

describe('IntegrationTestRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new IntegrationTestRunner();
  });

  test('constructor initializes empty tests and results', () => {
    expect(runner.tests).toEqual([]);
    expect(runner.results).toEqual([]);
  });

  test('registerTest adds test', () => {
    runner.registerTest('test1', async () => {});
    expect(runner.tests.length).toBe(1);
    expect(runner.tests[0].name).toBe('test1');
  });

  test('registerTest adds multiple tests', () => {
    runner.registerTest('test1', async () => {});
    runner.registerTest('test2', async () => {});
    expect(runner.tests.length).toBe(2);
  });

  test('runAll returns report with passed tests', async () => {
    runner.registerTest('passing', async () => {});
    const report = await runner.runAll();
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.successRate).toBe('100.00%');
  });

  test('runAll captures failed tests', async () => {
    runner.registerTest('failing', async () => {
      throw new Error('something went wrong');
    });
    const report = await runner.runAll();
    expect(report.total).toBe(1);
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.successRate).toBe('0.00%');
  });

  test('runAll handles mixed results', async () => {
    runner.registerTest('passing', async () => {});
    runner.registerTest('failing', async () => {
      throw new Error('fail');
    });
    const report = await runner.runAll();
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.successRate).toBe('50.00%');
  });

  test('runAll populates results array', async () => {
    runner.registerTest('test1', async () => {});
    await runner.runAll();
    expect(runner.results.length).toBe(1);
    expect(runner.results[0].name).toBe('test1');
    expect(runner.results[0].status).toBe('passed');
    expect(runner.results[0]).toHaveProperty('duration');
    expect(runner.results[0]).toHaveProperty('timestamp');
  });

  test('generateReport returns correct stats', () => {
    runner.results = [
      { name: 'a', status: 'passed', duration: 10, timestamp: 't1' },
      { name: 'b', status: 'failed', error: 'err', timestamp: 't2' }
    ];
    runner.tests = [{ name: 'a' }, { name: 'b' }];
    const report = runner.generateReport();
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.successRate).toBe('50.00%');
  });

  test('runAll runs tests sequentially', async () => {
    const order = [];
    runner.registerTest('first', async () => { order.push('first'); });
    runner.registerTest('second', async () => { order.push('second'); });
    await runner.runAll();
    expect(order).toEqual(['first', 'second']);
  });

  test('failed test records error message', async () => {
    runner.registerTest('fail', async () => {
      throw new Error('custom error');
    });
    await runner.runAll();
    expect(runner.results[0].error).toBe('custom error');
  });

  test('empty runner report', () => {
    const report = runner.generateReport();
    expect(report.successRate).toBe('NaN%');
  });

  test('runAll with no tests returns report', async () => {
    const report = await runner.runAll();
    expect(report.total).toBe(0);
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(0);
  });
});

describe('module-level integration tests', () => {
  test('all module-level tests pass', async () => {
    const report = await runner.runAll();
    expect(report.failed).toBe(0);
  });
});
