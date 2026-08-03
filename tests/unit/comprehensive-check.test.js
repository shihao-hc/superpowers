describe('ComprehensiveCheck', () => {
  let ComprehensiveCheck;
  let checker;
  let bs;

  beforeAll(() => {
    ComprehensiveCheck = require('../../src/utils/ComprehensiveCheck');
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    bs = {
      comprehensiveChecker: {
        run: jest.fn().mockResolvedValue({ stats: { passed: 56, failed: 0 } })
      }
    };
    checker = new ComprehensiveCheck(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_autoComprehensiveCheck', () => {
    it('returns not triggered when result is null', () => {
      const result = checker._autoComprehensiveCheck('ctx', null, 'action');
      expect(result).toEqual({ triggered: false, reason: '任务未成功' });
    });

    it('returns not triggered when result.success is false', () => {
      const result = checker._autoComprehensiveCheck('ctx', { success: false }, 'action');
      expect(result).toEqual({ triggered: false, reason: '任务未成功' });
    });

    it('returns not triggered when comprehensiveChecker not available', () => {
      bs.comprehensiveChecker = null;
      const result = checker._autoComprehensiveCheck('ctx', { success: true }, 'action');
      expect(result).toEqual({ triggered: false, reason: 'ComprehensiveChecker未初始化' });
    });

    it('returns executing status when triggered', () => {
      const result = checker._autoComprehensiveCheck('ctx', { success: true }, 'action');
      expect(result).toEqual({ triggered: true, status: 'executing' });
    });

    it('calls comprehensiveChecker.run', () => {
      checker._autoComprehensiveCheck('ctx', { success: true }, 'action');
      expect(bs.comprehensiveChecker.run).toHaveBeenCalled();
    });
  });
});
