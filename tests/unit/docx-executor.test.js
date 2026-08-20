const fs = require('fs');
const path = require('path');

jest.mock('fs');

// Build mockDocx at module level (before jest.mock factory is lazily called)
const mockDocx = {};
mockDocx.Document = jest.fn().mockImplementation(function(opts) {
  this.options = opts || {};
  this.sections = [];
});
mockDocx.Document.prototype.addSection = jest.fn(function(section) {
  this.sections.push(section);
});
mockDocx.Packer = { toBuffer: jest.fn().mockResolvedValue(Buffer.from('docx-content')) };
mockDocx.Paragraph = jest.fn();
mockDocx.TextRun = jest.fn();
mockDocx.Table = jest.fn();
mockDocx.TableRow = jest.fn();
mockDocx.TableCell = jest.fn();
mockDocx.ImageRun = jest.fn();
mockDocx.Header = jest.fn();
mockDocx.Footer = jest.fn();
mockDocx.AlignmentType = { CENTER: 'center', LEFT: 'left', RIGHT: 'right', JUSTIFIED: 'justified' };
mockDocx.HeadingLevel = { TITLE: 'Title', HEADING_1: 'Heading1', HEADING_2: 'Heading2', HEADING_3: 'Heading3', HEADING_4: 'Heading4' };
mockDocx.BorderStyle = { SINGLE: 'single' };
mockDocx.WidthType = { DXA: 'dxa', PERCENTAGE: 'pct' };
mockDocx.ShadingType = { CLEAR: 'clear' };
mockDocx.VerticalAlign = { CENTER: 'center' };
mockDocx.PageNumber = { CURRENT: 'current', TOTAL_PAGES: 'totalPages' };
mockDocx.PageBreak = jest.fn();
mockDocx.TableOfContents = jest.fn();

jest.mock('docx', () => mockDocx);

const { DocxExecutor } = require('../../src/skills/executors/DocxExecutor');

describe('DocxExecutor', () => {
  const mockCwd = 'C:\\test\\project';
  const existingFile = path.join(mockCwd, 'existing.docx');
  const imagePath = path.join(mockCwd, 'image.png');
  const mockStats = {
    size: 12345,
    birthtime: new Date('2024-01-01'),
    mtime: new Date('2024-06-01')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    fs.existsSync.mockImplementation((p) => {
      if (p === existingFile || p === imagePath) return true;
      return false;
    });
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
    fs.statSync.mockReturnValue(mockStats);
    fs.readFileSync.mockReturnValue(Buffer.from('image-data'));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const uploadsPrefix = path.join(mockCwd, 'uploads', 'skills');

  function expectFileResult(result) {
    expect(result).toMatchObject({
      type: 'file',
      url: expect.stringMatching(/^\/skill-outputs\//),
      size: 12,
      path: expect.stringContaining(uploadsPrefix)
    });
    expect(result.message).toContain('successfully');
  }

  // ========== execute dispatch ==========
  describe('execute dispatch', () => {
    it('dispatches to createDocument for action "create"', async () => {
      const result = await DocxExecutor.execute({
        action: 'create', content: 'hello', skill: { name: 'test' }
      });
      expectFileResult(result);
      expect(result.path).toContain('docx-');
    });

    it('dispatches to createDocumentWithHeadings for action "createWithHeadings"', async () => {
      const result = await DocxExecutor.execute({
        action: 'createWithHeadings', headings: [{ level: 1, text: 'H1' }], skill: { name: 'test' }
      });
      expectFileResult(result);
      expect(result.headingsCount).toBe(1);
    });

    it('dispatches to createDocumentWithTable for action "createWithTable"', async () => {
      const result = await DocxExecutor.execute({
        action: 'createWithTable', tableData: [['a']], headers: ['Col'], skill: { name: 'test' }
      });
      expectFileResult(result);
      expect(result.tableRows).toBe(1);
    });

    it('dispatches to createDocumentWithImage for action "createWithImage"', async () => {
      const result = await DocxExecutor.execute({
        action: 'createWithImage', images: [], skill: { name: 'test' }
      });
      expectFileResult(result);
      expect(result.imagesCount).toBe(0);
    });

    it('dispatches to createReport for action "createReport"', async () => {
      const result = await DocxExecutor.execute({
        action: 'createReport', title: 'Report', sections: [], skill: { name: 'test' }
      });
      expectFileResult(result);
      expect(result.sectionsCount).toBe(0);
    });

    it('dispatches to readDocument for action "read"', async () => {
      const result = await DocxExecutor.execute({
        action: 'read', filePath: existingFile
      });
      expect(result.type).toBe('text');
      expect(result.content).toContain('Document content extracted');
    });

    it('dispatches to editDocument for action "edit"', async () => {
      const result = await DocxExecutor.execute({
        action: 'edit', filePath: existingFile
      });
      expect(result.type).toBe('file');
      expect(result.path).toContain('-edited-');
      expect(result.size).toBe(12);
    });

    it('dispatches to addTableOfContents for action "addTableOfContents"', async () => {
      const result = await DocxExecutor.execute({
        action: 'addTableOfContents', filePath: existingFile
      });
      expect(result.type).toBe('file');
      expect(result.path).toBe(existingFile);
    });

    it('dispatches to addHeaderFooter for action "addHeaderFooter"', async () => {
      const result = await DocxExecutor.execute({
        action: 'addHeaderFooter', filePath: existingFile
      });
      expect(result.type).toBe('file');
      expect(result.path).toBe(existingFile);
    });

    it('defaults action to "create" when no action provided', async () => {
      const result = await DocxExecutor.execute({
        content: 'default', skill: { name: 'test' }
      });
      expectFileResult(result);
    });

    it('throws for unsupported action', async () => {
      await expect(DocxExecutor.execute({ action: 'bogus' })).rejects.toThrow(
        'DocxExecutor failed: Unsupported action: bogus'
      );
    });

    it('wraps internal error with DocxExecutor prefix', async () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      await expect(DocxExecutor.execute({
        action: 'create', content: 'x', skill: { name: 'test' }
      })).rejects.toThrow('DocxExecutor failed: disk full');
    });
  });

  // ========== createDocument ==========
  describe('createDocument', () => {
    it('creates document with title and string content', async () => {
      const result = await DocxExecutor.createDocument({
        title: 'My Doc', content: 'Hello world', author: 'Tester',
        skill: { name: 'test-skill' }
      });
      expectFileResult(result);
      expect(result.path).toContain('test-skill');
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockDocx.Packer.toBuffer).toHaveBeenCalled();
    });

    it('creates document with content as array', async () => {
      const result = await DocxExecutor.createDocument({
        content: ['line1', 'line2'], skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('creates document with data as key-value pairs', async () => {
      const result = await DocxExecutor.createDocument({
        data: { name: 'Alice', age: 30 }, skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('uses filePath to determine output path', async () => {
      const result = await DocxExecutor.createDocument({
        filePath: 'my-report.docx', skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.path).toContain('my-report.docx');
    });

    it('uses "unknown" skill name when skill is missing', async () => {
      const result = await DocxExecutor.createDocument({ content: 'test' });
      expectFileResult(result);
      expect(result.path).toContain('unknown');
    });

    it('handles minimal inputs without title or content', async () => {
      const result = await DocxExecutor.createDocument({ skill: { name: 'minimal' } });
      expectFileResult(result);
    });

    it('handles content array with non-string items', async () => {
      const result = await DocxExecutor.createDocument({
        content: ['line1', { custom: 'object' }, 42], skill: { name: 's' }
      });
      expectFileResult(result);
      expect(mockDocx.Paragraph).toHaveBeenCalled();
    });

    it('uses default author and subject when not provided', async () => {
      await DocxExecutor.createDocument({
        title: 'Untitled', skill: { name: 's' }
      });
      expect(mockDocx.Document).toHaveBeenCalledWith(
        expect.objectContaining({
          creator: 'UltraWork Skill Executor',
          title: 'Untitled',
          subject: 'Document created by skill executor'
        })
      );
    });
  });

  // ========== createDocumentWithHeadings ==========
  describe('createDocumentWithHeadings', () => {
    const headings = [
      { level: 1, text: 'Section 1', content: 'Intro content' },
      { level: 2, text: 'Section 1.1', content: 'Detail' },
      { level: 3, text: 'Section 1.1.1' },
      { level: 4, text: 'Deep section' }
    ];

    it('creates document with headings at various levels', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        title: 'Heading Doc', headings, skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.headingsCount).toBe(4);
    });

    it('creates document without headings array', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        title: 'No headings', skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.headingsCount).toBe(0);
    });

    it('handles headings without level or text', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        headings: [{ foo: 'bar' }], skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.headingsCount).toBe(1);
    });

    it('includes general content when not an array', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        content: 'General text', skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('uses filePath when provided', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        headings: [{ level: 1, text: 'A' }], filePath: 'heading-test.docx', skill: { name: 's' }
      });
      expect(result.path).toContain('heading-test.docx');
    });

    it('uses "unknown" skill name when skill is missing', async () => {
      const result = await DocxExecutor.createDocumentWithHeadings({
        headings: [{ level: 1, text: 'A' }]
      });
      expectFileResult(result);
      expect(result.path).toContain('unknown');
    });
  });

  // ========== createDocumentWithTable ==========
  describe('createDocumentWithTable', () => {
    it('creates document with headers and data rows', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        title: 'Table Doc',
        headers: ['Name', 'Age', 'City'],
        tableData: [['Alice', '30', 'NYC'], ['Bob', '25', 'SF']],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.tableRows).toBe(2);
      expect(result.tableColumns).toBe(3);
    });

    it('creates document without headers', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        tableData: [['just', 'data']], skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.tableRows).toBe(1);
      expect(result.tableColumns).toBe(0);
    });

    it('creates document without tableData', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        title: 'No table', skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.tableRows).toBe(0);
    });

    it('uses custom tableWidth', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        tableData: [['a']], tableWidth: 6000, skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('skips non-array row entries', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        headers: ['H'],
        tableData: [['valid'], 'invalid'],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.tableRows).toBe(2);
    });

    it('uses filePath when provided', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        tableData: [['a']], filePath: 'table-test.docx', skill: { name: 's' }
      });
      expect(result.path).toContain('table-test.docx');
    });

    it('uses "unknown" skill name when skill is missing', async () => {
      const result = await DocxExecutor.createDocumentWithTable({
        tableData: [['a']]
      });
      expectFileResult(result);
      expect(result.path).toContain('unknown');
    });
  });

  // ========== createDocumentWithImage ==========
  describe('createDocumentWithImage', () => {
    it('creates document with existing image', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        title: 'Image Doc',
        images: [{ path: imagePath, title: 'Photo', description: 'A photo', name: 'img1' }],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.imagesCount).toBe(1);
      expect(fs.readFileSync).toHaveBeenCalledWith(imagePath);
    });

    it('adds caption for image', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        images: [{ path: imagePath, caption: 'Figure 1' }],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.imagesCount).toBe(1);
    });

    it('uses custom image dimensions', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        images: [{ path: imagePath }],
        imageWidth: 600, imageHeight: 400,
        skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('uses per-image dimensions over global', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        images: [{ path: imagePath, width: 800, height: 500 }],
        imageWidth: 600, imageHeight: 400,
        skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('logs warning when image read fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      fs.readFileSync.mockImplementation(() => { throw new Error('read error'); });
      fs.existsSync.mockImplementation((p) => p === 'broken.png');
      const result = await DocxExecutor.createDocumentWithImage({
        images: [{ path: 'broken.png' }],
        skill: { name: 's' }
      });
      expect(result.imagesCount).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add image'),
        expect.any(String)
      );
      warnSpy.mockRestore();
    });

    it('handles empty images array', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        images: [], skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.imagesCount).toBe(0);
    });

    it('creates document with content before images', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        content: 'Some text before image',
        images: [{ path: imagePath }],
        skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('uses filePath when provided', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        filePath: 'image-test.docx', images: [], skill: { name: 's' }
      });
      expect(result.path).toContain('image-test.docx');
    });

    it('uses "unknown" skill name when skill is missing', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        images: [{ path: imagePath }]
      });
      expectFileResult(result);
      expect(result.path).toContain('unknown');
    });

    it('handles missing images field', async () => {
      const result = await DocxExecutor.createDocumentWithImage({
        title: 'No images', skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.imagesCount).toBe(0);
    });
  });

  // ========== createReport ==========
  describe('createReport', () => {
    const sections = [
      {
        title: 'Introduction', level: 1, content: 'This is intro.',
        subsections: [
          { title: 'Background', content: 'Background info' },
          { title: 'Scope', content: 'Scope of work' }
        ]
      },
      { title: 'Analysis', level: 2, content: ['Point 1', 'Point 2'] },
      { title: 'Findings', level: 3, content: 'Key findings here' }
    ];

    it('creates full report with title, author, date, sections, abstract, conclusion', async () => {
      const result = await DocxExecutor.createReport({
        title: 'Annual Report',
        author: 'Jane Doe',
        date: '2024-06-01',
        sections,
        abstract: 'This report covers the year 2024.',
        conclusion: 'Overall, a successful year.',
        includeToc: true,
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.sectionsCount).toBe(3);
    });

    it('creates report without title', async () => {
      const result = await DocxExecutor.createReport({
        sections: [{ title: 'Section', content: 'Content' }],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.sectionsCount).toBe(1);
    });

    it('creates report without sections', async () => {
      const result = await DocxExecutor.createReport({
        title: 'Empty Report', skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.sectionsCount).toBe(0);
    });

    it('creates report without abstract or conclusion', async () => {
      const result = await DocxExecutor.createReport({
        title: 'Minimal Report', sections: [{ title: 'S1' }], skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('creates report with includeToc false', async () => {
      const result = await DocxExecutor.createReport({
        title: 'No TOC', sections: [], includeToc: false, skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('creates report without author or date', async () => {
      const result = await DocxExecutor.createReport({
        title: 'Anonymous', sections: [], skill: { name: 's' }
      });
      expectFileResult(result);
    });

    it('handles section with array content', async () => {
      const result = await DocxExecutor.createReport({
        title: 'Array Content',
        sections: [{ title: 'Bullets', content: ['item1', 'item2', 'item3'] }],
        skill: { name: 's' }
      });
      expectFileResult(result);
      expect(result.sectionsCount).toBe(1);
    });

    it('uses filePath when provided', async () => {
      const result = await DocxExecutor.createReport({
        sections: [], filePath: 'report-test.docx', skill: { name: 's' }
      });
      expect(result.path).toContain('report-test.docx');
    });

    it('uses "unknown" skill name when skill is missing', async () => {
      const result = await DocxExecutor.createReport({
        title: 'No Skill', sections: []
      });
      expectFileResult(result);
      expect(result.path).toContain('unknown');
    });
  });

  // ========== readDocument ==========
  describe('readDocument', () => {
    it('reads existing document and returns content with metadata', async () => {
      const result = await DocxExecutor.readDocument({ filePath: existingFile });
      expect(result.type).toBe('text');
      expect(result.content).toContain('Document content extracted');
      expect(result.content).toContain(`Size: ${mockStats.size} bytes`);
      expect(result.metadata).toEqual({
        size: mockStats.size,
        created: mockStats.birthtime,
        modified: mockStats.mtime
      });
      expect(fs.statSync).toHaveBeenCalledWith(existingFile);
    });

    it('throws when filePath is missing', async () => {
      await expect(DocxExecutor.readDocument({})).rejects.toThrow('File not found: undefined');
    });

    it('throws when file does not exist', async () => {
      await expect(DocxExecutor.readDocument({ filePath: 'missing.docx' })).rejects.toThrow(
        'File not found: missing.docx'
      );
    });
  });

  // ========== editDocument ==========
  describe('editDocument', () => {
    it('edits document with content', async () => {
      const result = await DocxExecutor.editDocument({
        filePath: existingFile, content: 'Updated content', skill: { name: 's' }
      });
      expect(result.type).toBe('file');
      expect(result.path).toContain('-edited-');
      expect(result.size).toBe(12);
    });

    it('edits document with content array', async () => {
      const result = await DocxExecutor.editDocument({
        filePath: existingFile, content: ['line1', 'line2']
      });
      expect(result.type).toBe('file');
      expect(result.path).toContain('-edited-');
    });

    it('edits document with data key-value pairs', async () => {
      const result = await DocxExecutor.editDocument({
        filePath: existingFile, data: { key1: 'val1', key2: 'val2' }
      });
      expect(result.type).toBe('file');
    });

    it('edits document with modifications', async () => {
      const result = await DocxExecutor.editDocument({
        filePath: existingFile,
        modifications: { field1: 'newValue', field2: 'updated' }
      });
      expect(result.type).toBe('file');
    });

    it('throws when file is missing', async () => {
      await expect(DocxExecutor.editDocument({ filePath: 'nope.docx' })).rejects.toThrow(
        'File not found: nope.docx'
      );
    });

    it('throws when filePath is missing', async () => {
      await expect(DocxExecutor.editDocument({})).rejects.toThrow('File not found: undefined');
    });
  });

  // ========== addTableOfContents ==========
  describe('addTableOfContents', () => {
    it('returns placeholder with existing file', async () => {
      const result = await DocxExecutor.addTableOfContents({ filePath: existingFile });
      expect(result.type).toBe('file');
      expect(result.path).toBe(existingFile);
      expect(result.message).toContain('Table of contents added');
      expect(result.note).toContain('placeholder');
    });

    it('throws when file is missing', async () => {
      await expect(DocxExecutor.addTableOfContents({ filePath: 'nope.docx' })).rejects.toThrow(
        'File not found: nope.docx'
      );
    });

    it('throws when filePath is missing', async () => {
      await expect(DocxExecutor.addTableOfContents({})).rejects.toThrow(
        'File not found: undefined'
      );
    });
  });

  // ========== addHeaderFooter ==========
  describe('addHeaderFooter', () => {
    it('returns placeholder with header and footer flags', async () => {
      const result = await DocxExecutor.addHeaderFooter({
        filePath: existingFile, header: 'Header', footer: 'Footer'
      });
      expect(result.type).toBe('file');
      expect(result.path).toBe(existingFile);
      expect(result.headerAdded).toBe(true);
      expect(result.footerAdded).toBe(true);
    });

    it('returns placeholder with no header or footer flags', async () => {
      const result = await DocxExecutor.addHeaderFooter({
        filePath: existingFile
      });
      expect(result.headerAdded).toBe(false);
      expect(result.footerAdded).toBe(false);
    });

    it('throws when file is missing', async () => {
      await expect(DocxExecutor.addHeaderFooter({ filePath: 'nope.docx' })).rejects.toThrow(
        'File not found: nope.docx'
      );
    });

    it('throws when filePath is missing', async () => {
      await expect(DocxExecutor.addHeaderFooter({})).rejects.toThrow('File not found: undefined');
    });
  });
});
