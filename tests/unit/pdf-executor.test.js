const { PdfExecutor } = require('../../src/skills/executors/PdfExecutor');

const mockPdfDoc = {
  pipe: jest.fn().mockReturnThis(),
  end: jest.fn(),
  on: jest.fn(),
  fontSize: jest.fn().mockReturnThis(),
  font: jest.fn().mockReturnThis(),
  text: jest.fn().mockReturnThis(),
  moveDown: jest.fn().mockReturnThis(),
  rect: jest.fn().mockReturnThis(),
  fill: jest.fn().mockReturnThis(),
  fillColor: jest.fn().mockReturnThis(),
  opacity: jest.fn().mockReturnThis(),
  save: jest.fn().mockReturnThis(),
  restore: jest.fn().mockReturnThis(),
  rotate: jest.fn().mockReturnThis(),
  image: jest.fn().mockReturnThis(),
  lineWidth: jest.fn().mockReturnThis(),
  moveTo: jest.fn().mockReturnThis(),
  lineTo: jest.fn().mockReturnThis(),
  stroke: jest.fn().mockReturnThis(),
  strokeColor: jest.fn().mockReturnThis(),
  circle: jest.fn().mockReturnThis(),
  translate: jest.fn().mockReturnThis(),
  scale: jest.fn().mockReturnThis(),
  annotate: jest.fn().mockReturnThis(),
  addPage: jest.fn().mockReturnThis(),
  page: { size: [595.28, 841.89] },
  y: 100
};

jest.mock('pdfkit', () => jest.fn(() => mockPdfDoc));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

const fs = require('fs');
const PDFDocument = require('pdfkit');

describe('PdfExecutor', () => {
  let mockWriteStream;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    mockWriteStream = {
      on: jest.fn((event, cb) => {
        if (event === 'finish') setTimeout(() => cb(), 5);
        return mockWriteStream;
      }),
      write: jest.fn().mockReturnThis(),
      end: jest.fn()
    };

    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.createWriteStream.mockReturnValue(mockWriteStream);
    fs.statSync.mockReturnValue({ size: 12345, birthtime: new Date('2024-01-01'), mtime: new Date('2024-01-02') });
    fs.readFileSync.mockReturnValue(Buffer.from('mock pdf content'));
    fs.writeFileSync.mockReturnValue(undefined);
    PDFDocument.mockReturnValue(mockPdfDoc);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should export PdfExecutor class with static methods', () => {
    expect(PdfExecutor).toBeDefined();
    expect(typeof PdfExecutor.execute).toBe('function');
    expect(typeof PdfExecutor.createPDF).toBe('function');
    expect(typeof PdfExecutor.createPDFWithForm).toBe('function');
    expect(typeof PdfExecutor.createPDFWithTable).toBe('function');
    expect(typeof PdfExecutor.createPDFReport).toBe('function');
    expect(typeof PdfExecutor.createPDFInvoice).toBe('function');
    expect(typeof PdfExecutor.readPDF).toBe('function');
    expect(typeof PdfExecutor.editPDF).toBe('function');
    expect(typeof PdfExecutor.addWatermark).toBe('function');
    expect(typeof PdfExecutor.addPageNumbers).toBe('function');
    expect(typeof PdfExecutor.addBookmarks).toBe('function');
  });

  describe('execute', () => {
    const actions = [
      ['create', 'createPDF'],
      ['createWithForm', 'createPDFWithForm'],
      ['createWithTable', 'createPDFWithTable'],
      ['createReport', 'createPDFReport'],
      ['createInvoice', 'createPDFInvoice'],
      ['read', 'readPDF'],
      ['edit', 'editPDF'],
      ['addWatermark', 'addWatermark'],
      ['addPageNumbers', 'addPageNumbers'],
      ['addBookmarks', 'addBookmarks']
    ];

    test.each(actions)('should dispatch %s action', async (action) => {
      fs.existsSync.mockReturnValue(true);

      const inputs = {
        action,
        skill: { name: 'test-skill' },
        title: 'Test Doc',
        filePath: 'test-file.pdf'
      };

      const result = await PdfExecutor.execute(inputs);
      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    test('should default to create action when action not provided', async () => {
      const result = await PdfExecutor.execute({ skill: { name: 'test' } });
      expect(result.type).toBe('file');
      expect(result.message).toContain('PDF created');
    });

    test('should throw for unsupported action', async () => {
      await expect(PdfExecutor.execute({ action: 'invalid' })).rejects.toThrow('PdfExecutor failed: Unsupported action: invalid');
    });

    test('should wrap errors from dispatched methods', async () => {
      jest.spyOn(PdfExecutor, 'createPDF').mockRejectedValue(new Error('internal error'));
      await expect(PdfExecutor.execute({ action: 'create' })).rejects.toThrow('PdfExecutor failed: internal error');
      jest.restoreAllMocks();
    });
  });

  describe('createPDF', () => {
    test('should create PDF with title', async () => {
      const result = await PdfExecutor.createPDF({ title: 'Test Title', skill: { name: 'test-skill' } });

      expect(PDFDocument).toHaveBeenCalledWith(expect.objectContaining({
        info: expect.objectContaining({ Title: 'Test Title' })
      }));
      expect(mockPdfDoc.pipe).toHaveBeenCalled();
      expect(mockPdfDoc.fontSize).toHaveBeenCalledWith(24);
      expect(mockPdfDoc.font).toHaveBeenCalledWith('Helvetica-Bold');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Test Title', expect.any(Object));
      expect(mockPdfDoc.end).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result.type).toBe('file');
      expect(result.size).toBe(12345);
      expect(result.message).toContain('PDF created successfully');
    });

    test('should create PDF with string content', async () => {
      await PdfExecutor.createPDF({ content: 'Some body content', skill: { name: 'test' } });

      expect(mockPdfDoc.fontSize).toHaveBeenCalledWith(12);
      expect(mockPdfDoc.font).toHaveBeenCalledWith('Helvetica');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Some body content', expect.objectContaining({ align: 'justify' }));
    });

    test('should create PDF with array content', async () => {
      await PdfExecutor.createPDF({ content: ['Line 1', 'Line 2'], skill: { name: 'test' } });

      expect(mockPdfDoc.text).toHaveBeenCalledWith('Line 1', expect.objectContaining({ align: 'left' }));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Line 2', expect.objectContaining({ align: 'left' }));
    });

    test('should create PDF with data key-value pairs', async () => {
      await PdfExecutor.createPDF({
        data: { Name: 'Alice', Age: '30' },
        skill: { name: 'test' }
      });

      expect(mockPdfDoc.text).toHaveBeenCalledWith('Name: ', expect.objectContaining({ continued: true }));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Alice');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Age: ', expect.objectContaining({ continued: true }));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('30');
    });

    test('should create PDF with custom dimensions', async () => {
      await PdfExecutor.createPDF({ width: 800, height: 600, skill: { name: 'test' } });

      expect(PDFDocument).toHaveBeenCalledWith(expect.objectContaining({
        size: [800, 600]
      }));
    });

    test('should create PDF with specified filePath', async () => {
      const result = await PdfExecutor.createPDF({ filePath: 'my-doc.pdf', skill: { name: 'test' } });

      expect(result.path).toContain('my-doc.pdf');
      expect(result.url).toBe('/skill-outputs/my-doc.pdf');
    });

    test('should create PDF with author, subject, keywords', async () => {
      await PdfExecutor.createPDF({
        title: 'Doc',
        author: 'Test Author',
        subject: 'Test Subject',
        keywords: 'test,pdf',
        skill: { name: 'test' }
      });

      expect(PDFDocument).toHaveBeenCalledWith(expect.objectContaining({
        info: expect.objectContaining({
          Author: 'Test Author',
          Subject: 'Test Subject',
          Keywords: 'test,pdf'
        })
      }));
    });

    test('should create PDF with defaults when no options', async () => {
      const result = await PdfExecutor.createPDF({});

      expect(PDFDocument).toHaveBeenCalledWith(expect.objectContaining({
        size: [595.28, 841.89]
      }));
      expect(result.type).toBe('file');
      expect(result.message).toContain('PDF created successfully');
    });
  });

  describe('createPDFWithForm', () => {
    test('should create PDF form with fields', async () => {
      const formFields = [
        { label: 'Name', type: 'text', required: true },
        { label: 'Agree', type: 'checkbox' },
        { label: 'Country', type: 'dropdown' },
        { label: 'Count', type: 'number' }
      ];
      const result = await PdfExecutor.createPDFWithForm({
        title: 'Test Form',
        formFields,
        skill: { name: 'test' }
      });

      expect(PDFDocument).toHaveBeenCalled();
      expect(mockPdfDoc.rect).toHaveBeenCalled();
      expect(mockPdfDoc.stroke).toHaveBeenCalled();
      expect(result.type).toBe('file');
      expect(result.formFieldsCount).toBe(4);
      expect(result.message).toContain('PDF with form created successfully');
    });

    test('should create PDF form with data', async () => {
      const result = await PdfExecutor.createPDFWithForm({
        title: 'Form',
        formFields: [{ label: 'Name', type: 'text' }],
        data: { Name: 'Alice' },
        skill: { name: 'test' }
      });

      expect(mockPdfDoc.text).toHaveBeenCalledWith('Form Data:', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Name: Alice');
      expect(result.formFieldsCount).toBe(1);
    });
  });

  describe('createPDFWithTable', () => {
    test('should create PDF with table', async () => {
      const result = await PdfExecutor.createPDFWithTable({
        title: 'Data Table',
        headers: ['Name', 'Age'],
        tableData: [['Alice', '30'], ['Bob', '25']],
        skill: { name: 'test' }
      });

      expect(PDFDocument).toHaveBeenCalled();
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Data Table', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Name', expect.any(Number), expect.any(Number), expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Alice', expect.any(Number), expect.any(Number), expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Bob', expect.any(Number), expect.any(Number), expect.any(Object));
      expect(result.type).toBe('file');
      expect(result.tableRows).toBe(2);
      expect(result.tableColumns).toBe(2);
    });

    test('should handle empty table data', async () => {
      const result = await PdfExecutor.createPDFWithTable({
        title: 'Empty',
        headers: ['Col1'],
        tableData: [],
        skill: { name: 'test' }
      });

      expect(result.tableRows).toBe(0);
      expect(result.tableColumns).toBe(1);
    });
  });

  describe('createPDFReport', () => {
    test('should create PDF report with sections', async () => {
      const result = await PdfExecutor.createPDFReport({
        title: 'Annual Report',
        author: 'John Doe',
        date: '2024-01-01',
        abstract: 'Report abstract',
        sections: [
          {
            title: 'Section 1',
            content: 'Content text',
            subsections: [{ title: 'Subsection A', content: 'Sub content' }]
          },
          {
            title: 'Section 2',
            content: ['Item 1', 'Item 2']
          }
        ],
        conclusion: 'In conclusion...',
        skill: { name: 'test' }
      });

      expect(PDFDocument).toHaveBeenCalled();
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Annual Report', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Prepared by: John Doe', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Abstract', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Section 1', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Subsection A', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Conclusion', expect.any(Object));
      expect(mockPdfDoc.addPage).toHaveBeenCalled();
      expect(result.type).toBe('file');
      expect(result.sectionsCount).toBe(2);
    });

    test('should create report without optional fields', async () => {
      const result = await PdfExecutor.createPDFReport({
        sections: [{ content: 'Only content' }],
        skill: { name: 'test' }
      });

      expect(result.sectionsCount).toBe(1);
      expect(result.type).toBe('file');
    });
  });

  describe('createPDFInvoice', () => {
    test('should create PDF invoice with items and tax/discount', async () => {
      const result = await PdfExecutor.createPDFInvoice({
        invoiceNumber: 'INV-001',
        date: '2024-01-01',
        dueDate: '2024-01-31',
        from: { Company: 'ACME Inc', Address: '123 Main St' },
        to: { Client: 'Bob Smith' },
        items: [
          { description: 'Service A', quantity: 2, price: 100 },
          { description: 'Service B', quantity: 1, price: 50 }
        ],
        tax: 10,
        discount: { percentage: 5 },
        notes: 'Thank you for your business',
        skill: { name: 'test' }
      });

      expect(PDFDocument).toHaveBeenCalled();
      expect(mockPdfDoc.text).toHaveBeenCalledWith('INVOICE', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Invoice #: INV-001', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Date: 2024-01-01', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Due Date: 2024-01-31', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Company: ACME Inc');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Client: Bob Smith');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Notes:', expect.any(Object));
      expect(result.type).toBe('file');
      expect(result.invoiceNumber).toBe('INV-001');
      expect(result.itemsCount).toBe(2);
      expect(result.message).toContain('PDF invoice created successfully');
    });

    test('should create invoice with string from/to', async () => {
      const result = await PdfExecutor.createPDFInvoice({
        invoiceNumber: 'INV-002',
        from: 'ACME Inc\n123 Main St',
        to: 'Bob Smith\n456 Oak Ave',
        items: [{ description: 'Service', quantity: 1, price: 100 }],
        skill: { name: 'test' }
      });

      expect(mockPdfDoc.text).toHaveBeenCalledWith('ACME Inc\n123 Main St');
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Bob Smith\n456 Oak Ave');
      expect(result.itemsCount).toBe(1);
    });
  });

  describe('readPDF', () => {
    test('should read existing PDF file', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('existing.pdf'));

      const result = await PdfExecutor.readPDF({ filePath: 'existing.pdf' });

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result.type).toBe('text');
      expect(result.content).toContain('PDF content extracted from existing.pdf');
      expect(result.metadata.size).toBe(12345);
      expect(result.message).toContain('PDF read successfully');
    });

    test('should throw for missing file', async () => {
      await expect(PdfExecutor.readPDF({ filePath: 'missing.pdf' })).rejects.toThrow('File not found: missing.pdf');
    });

    test('should throw for undefined filePath', async () => {
      await expect(PdfExecutor.readPDF({})).rejects.toThrow('File not found: undefined');
    });
  });

  describe('editPDF', () => {
    test('should edit PDF with modifications and content', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('existing.pdf'));

      const result = await PdfExecutor.editPDF({
        filePath: 'existing.pdf',
        modifications: { key1: 'value1' },
        content: 'additional text',
        data: { dataKey: 'dataValue' }
      });

      expect(PDFDocument).toHaveBeenCalled();
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Edited PDF Document', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Modifications:', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Additional Content:', expect.any(Object));
      expect(mockPdfDoc.text).toHaveBeenCalledWith('Data:', expect.any(Object));
      expect(result.type).toBe('file');
      expect(result.path).toContain('-edited-');
      expect(result.message).toContain('PDF edited successfully');
    });

    test('should throw for missing file', async () => {
      await expect(PdfExecutor.editPDF({ filePath: 'missing.pdf' })).rejects.toThrow('File not found: missing.pdf');
    });
  });

  describe('addWatermark', () => {
    test('should add watermark text to PDF', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('doc.pdf'));

      const result = await PdfExecutor.addWatermark({
        filePath: 'doc.pdf',
        watermarkText: 'CONFIDENTIAL'
      });

      expect(result.type).toBe('file');
      expect(result.path).toBe('doc.pdf');
      expect(result.message).toContain('CONFIDENTIAL');
    });

    test('should throw for missing file', async () => {
      await expect(PdfExecutor.addWatermark({ filePath: 'missing.pdf' })).rejects.toThrow('File not found: missing.pdf');
    });
  });

  describe('addPageNumbers', () => {
    test('should add page numbers with default position', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('doc.pdf'));

      const result = await PdfExecutor.addPageNumbers({ filePath: 'doc.pdf' });

      expect(result.type).toBe('file');
      expect(result.path).toBe('doc.pdf');
      expect(result.message).toContain('bottom-center');
    });

    test('should add page numbers with custom position', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('doc.pdf'));

      const result = await PdfExecutor.addPageNumbers({
        filePath: 'doc.pdf',
        position: 'top-right'
      });

      expect(result.message).toContain('top-right');
    });
  });

  describe('addBookmarks', () => {
    test('should add bookmarks to PDF', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('doc.pdf'));

      const result = await PdfExecutor.addBookmarks({
        filePath: 'doc.pdf',
        bookmarks: [{ title: 'Chapter 1', page: 1 }]
      });

      expect(result.type).toBe('file');
      expect(result.path).toBe('doc.pdf');
      expect(result.bookmarksCount).toBe(1);
      expect(result.message).toContain('Bookmarks added');
    });

    test('should handle empty bookmarks', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('doc.pdf'));

      const result = await PdfExecutor.addBookmarks({ filePath: 'doc.pdf' });

      expect(result.bookmarksCount).toBe(0);
    });
  });
});
