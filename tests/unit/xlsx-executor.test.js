const fs = require('fs');
const path = require('path');

const mockWriteFile = jest.fn().mockResolvedValue(true);
const mockReadFile = jest.fn().mockResolvedValue(true);
const mockEachCell = jest.fn((cb) => {
  cb({ font: {}, fill: {} });
});
const mockAddRow = jest.fn(() => ({ eachCell: mockEachCell }));
const mockEachRow = jest.fn((cb) => {
  cb({ values: [undefined, 'A', 'B'] });
  cb({ values: [undefined, 1, 2] });
});

const mockSheet = {
  addRow: mockAddRow,
  eachRow: mockEachRow,
  eachCell: mockEachCell,
  getCell: jest.fn(() => ({ value: '', font: {}, alignment: {} })),
  mergeCells: jest.fn(),
  getRow: jest.fn(() => ({ commit: jest.fn() })),
  columns: []
};

const mockAddWorksheet = jest.fn(() => mockSheet);
const mockWorkbook = jest.fn().mockImplementation(() => ({
  creator: '',
  created: null,
  addWorksheet: mockAddWorksheet,
  eachSheet: jest.fn((cb) => cb(mockSheet)),
  xlsx: { writeFile: mockWriteFile, readFile: mockReadFile }
}));

jest.mock('exceljs', () => ({ Workbook: mockWorkbook }));

const { XlsxExecutor } = require('../../src/skills/executors/XlsxExecutor');

describe('XlsxExecutor', () => {
  const origCwd = process.cwd();
  let tmpDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'xlsx-test-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* */ }
  });

  it('creates a spreadsheet file', async () => {
    const r = await XlsxExecutor.execute({ action: 'create', title: '测试', skill: { name: 'xlsx' } });
    expect(r.type).toBe('file');
    expect(r.path).toContain(path.join('uploads', 'skills', 'xlsx'));
    expect(r.path.endsWith('.xlsx')).toBe(true);
    expect(mockWorkbook).toHaveBeenCalled();
  });

  it('creates spreadsheet with data (headers + rows)', async () => {
    const r = await XlsxExecutor.execute({
      action: 'createWithData', title: '销售', headers: ['产品', '销量'],
      data: [['苹果', 100], { 产品: '橙子', 销量: 50 }], skill: { name: 'xlsx' }
    });
    expect(r.type).toBe('file');
    expect(mockAddRow).toHaveBeenCalled();
  });

  it('reads spreadsheet content', async () => {
    const filePath = path.join(tmpDir, 'test.xlsx');
    fs.writeFileSync(filePath, 'fake');
    const r = await XlsxExecutor.execute({ action: 'read', filePath });
    expect(r.type).toBe('data');
    expect(r.sheets.length).toBeGreaterThan(0);
  });

  it('throws on unsupported action', async () => {
    await expect(XlsxExecutor.execute({ action: 'bogus' })).rejects.toThrow('Unsupported action');
  });

  it('forces skill name to whitelist value via AsyncExecutor (path traversal defense)', async () => {
    const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
    const ex = new AsyncExecutor();
    let receivedInputs = null;
    ex._loadExecutorModule = jest.fn(() => ({ execute: jest.fn(async (inputs) => { receivedInputs = inputs; return { ok: true }; }) }));
    try {
      await ex._getDefaultExecutor().execute('xlsx', { action: 'create', skill: { name: '../../evil' } });
      expect(receivedInputs.skill).toEqual({ name: 'xlsx' });
    } finally {
      ex.destroy();
    }
  });
});