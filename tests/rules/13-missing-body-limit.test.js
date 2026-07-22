const { runRule } = require('./helpers/testRule');

describe('MISSING_BODY_LIMIT (LOW)', () => {
  const R = 'MISSING_BODY_LIMIT';

  it('detects express.json() without limit', () => {
    const r = runRule('app.use(express.json());', R);
    expect(r).toHaveLength(1);
    expect(r[0].ruleId).toBe('MISSING_BODY_LIMIT');
  });

  it('detects express.urlencoded() without limit', () => {
    const r = runRule('app.use(express.urlencoded({ extended: false }));', R);
    expect(r).toHaveLength(1);
  });

  it('detects bodyParser.json() without limit', () => {
    const r = runRule('app.use(bodyParser.json());', R);
    expect(r).toHaveLength(1);
  });

  it('accepts express.json() with same-line limit', () => {
    const r = runRule('app.use(express.json({ limit: "1mb" }));', R);
    expect(r).toHaveLength(0);
  });

  it('accepts express.json() with limit on next line (single property)', () => {
    const r = runRule(
      'app.use(express.json({\n' +
      '  limit: "1mb"\n' +
      '}));', R
    );
    expect(r).toHaveLength(0);
  });

  it('accepts express.json() with limit on next line (multi property)', () => {
    const r = runRule(
      'app.use(express.urlencoded({\n' +
      '  extended: true,\n' +
      '  limit: "500kb"\n' +
      '}));', R
    );
    expect(r).toHaveLength(0);
  });

  it('does not flag non-express code', () => {
    const r = runRule('const data = JSON.parse(body);', R);
    expect(r).toHaveLength(0);
  });
});
