jest.mock('canvas', () => {
  const mockCreateRadialGradient = jest.fn(() => ({ addColorStop: jest.fn() }));
  const mockCreateLinearGradient = jest.fn(() => ({ addColorStop: jest.fn() }));
  const mockContext = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    textBaseline: '', globalAlpha: 1, lineCap: '', lineJoin: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    fillText: jest.fn(), strokeText: jest.fn(),
    measureText: jest.fn(() => ({ width: 100 })),
    beginPath: jest.fn(), closePath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    arc: jest.fn(), ellipse: jest.fn(), quadraticCurveTo: jest.fn(),
    bezierCurveTo: jest.fn(), fill: jest.fn(), stroke: jest.fn(),
    createLinearGradient: mockCreateLinearGradient,
    createRadialGradient: mockCreateRadialGradient,
    drawImage: jest.fn(), save: jest.fn(), restore: jest.fn(),
    scale: jest.fn(), rotate: jest.fn(), translate: jest.fn(),
    transform: jest.fn(), setTransform: jest.fn(), clip: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(40000) })),
    putImageData: jest.fn(),
  };
  const mockCanvas = { width: 800, height: 600, getContext: jest.fn(() => mockContext), toBuffer: jest.fn(() => Buffer.from('mock-data')) };
  return { createCanvas: jest.fn(() => mockCanvas), loadImage: jest.fn(() => Promise.resolve({ width: 100, height: 100 })), registerFont: jest.fn() };
}, { virtual: true });

jest.mock('fs');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { CanvasExecutor } = require('../../src/skills/executors/CanvasExecutor');

describe('CanvasExecutor', () => {
  let mockCtx;

  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
    jest.spyOn(console, 'warn').mockReturnValue();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue();
    fs.writeFileSync.mockReturnValue();
    const cvs = createCanvas();
    mockCtx = cvs.getContext();
  });

  const commonResultAssert = (result, extra = {}) => {
    expect(result).toHaveProperty('type', 'image');
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('message');
    if (extra.width !== undefined) expect(result).toHaveProperty('width', extra.width);
    if (extra.height !== undefined) expect(result).toHaveProperty('height', extra.height);
  };

  // ===================== execute =====================
  describe('execute', () => {

    it('dispatches to createCanvas for action "create"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'create' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('defaults action to create when missing', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({});
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to createCanvasWithElements for "createWithElements"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createCanvasWithElements').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'createWithElements' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to createChart for "createChart"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createChart').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'createChart' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to createIcon for "createIcon"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createIcon').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'createIcon' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to createBanner for "createBanner"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'createBanner').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'createBanner' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to editCanvas for "edit"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'editCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'edit', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to addTextToCanvas for "addText"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'addTextToCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'addText', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to addShapeToCanvas for "addShape"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'addShapeToCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'addShape', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to applyFilter for "applyFilter"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'applyFilter').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'applyFilter', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to resizeCanvas for "resize"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'resizeCanvas').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'resize', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to addGradient for "addGradient"', async () => {
      const spy = jest.spyOn(CanvasExecutor, 'addGradient').mockResolvedValue({});
      await CanvasExecutor.execute({ action: 'addGradient', filePath: '/tmp/t.png' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('throws for unknown action', async () => {
      await expect(CanvasExecutor.execute({ action: 'unknown' }))
        .rejects.toThrow('CanvasExecutor failed: Unsupported action: unknown');
    });
  });

  // ===================== createCanvas =====================
  describe('createCanvas', () => {
    it('creates a canvas with default parameters', async () => {
      const result = await CanvasExecutor.createCanvas({ skill: { name: 'test' } });
      expect(createCanvas).toHaveBeenCalledWith(800, 600);
      expect(mockCtx.fillStyle).toBe('#ffffff');
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(createCanvas().toBuffer).toHaveBeenCalledWith('image/png');
      expect(fs.writeFileSync).toHaveBeenCalled();
      commonResultAssert(result, { width: 800, height: 600 });
      expect(result.format).toBe('png');
    });

    it('accepts custom width, height, and background color', async () => {
      await CanvasExecutor.createCanvas({ width: 400, height: 300, backgroundColor: '#ff0000' });
      expect(createCanvas).toHaveBeenCalledWith(400, 300);
      expect(mockCtx.fillStyle).toBe('#ff0000');
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 400, 300);
    });

    it('draws title text when title is provided', async () => {
      await CanvasExecutor.createCanvas({ title: 'Hello', fontSize: 32, fontFamily: 'Arial', fontColor: '#333' });
      expect(mockCtx.font).toContain('32px');
      expect(mockCtx.fillStyle).toBe('#333');
      expect(mockCtx.textAlign).toBe('center');
      expect(mockCtx.textBaseline).toBe('middle');
      expect(mockCtx.fillText).toHaveBeenCalledWith('Hello', 400, 50);
    });

    it('draws elements when provided', async () => {
      const elements = [{ type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#00f' }];
      await CanvasExecutor.createCanvas({ elements });
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalledWith(10, 20, 100, 50);
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('handles vertical gradient background', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient:vertical:#ff0,#00f' });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 600);
    });

    it('handles horizontal gradient background', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient:horizontal:#ff0,#00f' });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 800, 0);
    });

    it('handles radial gradient background', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient:radial:#ff0,#00f' });
      expect(mockCtx.createRadialGradient).toHaveBeenCalledWith(400, 300, 0, 400, 300, 400);
    });

    it('falls back to white for invalid gradient format', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient:' });
      expect(mockCtx.fillStyle).toBe('#ffffff');
    });

    it('saves as JPEG when format is jpeg', async () => {
      await CanvasExecutor.createCanvas({ format: 'jpeg', quality: 0.8 });
      expect(createCanvas().toBuffer).toHaveBeenCalledWith('image/jpeg', { quality: 0.8 });
    });

    it('saves as WebP when format is webp', async () => {
      await CanvasExecutor.createCanvas({ format: 'webp' });
      expect(createCanvas().toBuffer).toHaveBeenCalledWith('image/webp', { quality: 0.92 });
    });

    it('creates output directory when it does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await CanvasExecutor.createCanvas({});
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('defaults gradient direction to vertical when missing', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient::#ff0,#00f' });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 600);
    });

    it('ignores unknown gradient direction', async () => {
      await CanvasExecutor.createCanvas({ backgroundColor: 'gradient:diag:#ff0,#00f' });
      expect(mockCtx.createLinearGradient).not.toHaveBeenCalled();
      expect(mockCtx.createRadialGradient).not.toHaveBeenCalled();
    });

    it('uses filePath for output when provided', async () => {
      const result = await CanvasExecutor.createCanvas({ filePath: 'out.png' });
      expect(result.path).toContain('out.png');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  // ===================== createCanvasWithElements =====================
  describe('createCanvasWithElements', () => {
    const elements = [
      { type: 'circle', color: '#f00', radius: 20 },
      { type: 'circle', color: '#0f0', radius: 20 },
      { type: 'circle', color: '#00f', radius: 20 },
    ];

    it('uses grid layout by default', async () => {
      const result = await CanvasExecutor.createCanvasWithElements({ elements, skill: { name: 't' } });
      commonResultAssert(result, { width: 800, height: 600 });
      expect(result.layout).toBe('grid');
      expect(result.elementsCount).toBe(3);
    });

    it('positions elements with flex layout', async () => {
      const result = await CanvasExecutor.createCanvasWithElements({ elements, layout: 'flex' });
      expect(result.layout).toBe('flex');
    });

    it('positions elements with absolute layout using element x/y', async () => {
      const absElements = [{ type: 'circle', x: 50, y: 100, color: '#f00' }];
      const result = await CanvasExecutor.createCanvasWithElements({ elements: absElements, layout: 'absolute' });
      expect(result.layout).toBe('absolute');
      expect(mockCtx.save).toHaveBeenCalled();
    });

    it('draws title when provided', async () => {
      await CanvasExecutor.createCanvasWithElements({ elements, title: 'My Grid' });
      expect(mockCtx.fillText).toHaveBeenCalledWith('My Grid', 400, 50);
    });

    it('works with default empty elements and creates uploads dir', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await CanvasExecutor.createCanvasWithElements({});
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result.elementsCount).toBe(0);
    });

    it('uses element x/y when provided in absolute layout', async () => {
      const absElements = [{ type: 'circle', x: 50, y: 100, color: '#f00' }];
      await CanvasExecutor.createCanvasWithElements({ elements: absElements, layout: 'absolute' });
      expect(mockCtx.arc).toHaveBeenCalledWith(50, 100, 25, 0, 2 * Math.PI);
    });

    it('uses padding defaults when element x/y missing in absolute layout', async () => {
      const absElements = [{ type: 'circle', color: '#f00' }];
      await CanvasExecutor.createCanvasWithElements({ elements: absElements, layout: 'absolute' });
      expect(mockCtx.arc).toHaveBeenCalledWith(40, 40, 25, 0, 2 * Math.PI);
    });

    it('uses filePath for output when provided', async () => {
      const result = await CanvasExecutor.createCanvasWithElements({ elements, filePath: 'grid.png' });
      expect(result.path).toContain('grid.png');
    });
  });

  // ===================== createChart =====================
  describe('createChart', () => {
    const data = [30, 50, 20];
    const labels = ['A', 'B', 'C'];

    it('creates a bar chart', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data, labels, title: 'Test' });
      commonResultAssert(result, { width: 800, height: 600 });
      expect(result.chartType).toBe('bar');
      expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('creates a line chart', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'line', data, labels });
      expect(result.chartType).toBe('line');
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.lineTo).toHaveBeenCalled();
    });

    it('creates a pie chart', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'pie', data, labels });
      expect(result.chartType).toBe('pie');
      expect(mockCtx.arc).toHaveBeenCalled();
    });

    it('creates a doughnut chart', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'doughnut', data, labels, colors: ['#f00', '#0f0', '#00f'] });
      expect(result.chartType).toBe('doughnut');
      expect(mockCtx.arc).toHaveBeenCalled();
    });

    it('skips legend when showLegend is false', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'pie', data, labels, showLegend: false });
      expect(result.chartType).toBe('pie');
    });

    it('skips value labels when showValues is false', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data, labels, showValues: false });
      expect(result.chartType).toBe('bar');
    });

    it('uses default chartType when not provided', async () => {
      const result = await CanvasExecutor.createChart({ data });
      expect(result.chartType).toBe('bar');
    });

    it('uses default data when not provided', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar' });
      expect(result.dataPoints).toBe(0);
    });

    it('uses default labels when not provided', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data });
      expect(result.chartType).toBe('bar');
    });

    it('handles unknown chartType gracefully', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'scatter', data, labels });
      expect(result.chartType).toBe('scatter');
    });

    it('uses filePath for output when provided', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data, labels, filePath: 'chart.png' });
      expect(result.path).toContain('chart.png');
    });

    it('falls back to point numbers when labels shorter than data', async () => {
      await CanvasExecutor.createChart({ chartType: 'bar', data: [10, 20, 30], labels: ['A'] });
      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('falls back to point numbers in line chart labels', async () => {
      await CanvasExecutor.createChart({ chartType: 'line', data: [10, 20, 30], labels: ['A'] });
      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('skips value labels in line chart when showValues is false', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'line', data, labels, showValues: false });
      expect(result.chartType).toBe('line');
    });

    it('falls back to unknown skill name when inputs.skill has no name', async () => {
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data, labels, skill: {} });
      expect(result).toBeDefined();
    });

    it('creates uploads directory when missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await CanvasExecutor.createChart({ chartType: 'bar', data, labels });
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ===================== createIcon =====================
  describe('createIcon', () => {
    it('creates a default icon', async () => {
      const result = await CanvasExecutor.createIcon({ skill: { name: 't' } });
      commonResultAssert(result, { size: 64 });
      expect(result.iconType).toBe('default');
    });

    it('creates a check icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'check' });
      expect(result.iconType).toBe('check');
      expect(mockCtx.moveTo).toHaveBeenCalled();
    });

    it('creates a cross icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'cross' });
      expect(result.iconType).toBe('cross');
    });

    it('creates an arrow-right icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'arrow-right' });
      expect(result.iconType).toBe('arrow-right');
    });

    it('creates a star icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'star', fill: true });
      expect(result.iconType).toBe('star');
    });

    it('creates a heart icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'heart' });
      expect(result.iconType).toBe('heart');
    });

    it('creates a user icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'user' });
      expect(result.iconType).toBe('user');
    });

    it('creates a settings icon', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'settings' });
      expect(result.iconType).toBe('settings');
    });

    it('fills background when backgroundColor is not transparent', async () => {
      await CanvasExecutor.createIcon({ iconType: 'check', backgroundColor: '#fff', size: 128 });
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 128, 128);
    });

    it('fills each icon type when fill is true', async () => {
      CanvasExecutor.drawCheckIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      mockCtx.fill.mockClear();
      CanvasExecutor.drawCrossIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.lineWidth).toBe(4);
      mockCtx.fill.mockClear();
      CanvasExecutor.drawArrowRightIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.lineWidth).toBe(3);
      mockCtx.fill.mockClear();
      CanvasExecutor.drawStarIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      mockCtx.fill.mockClear();
      CanvasExecutor.drawStarIcon(mockCtx, 32, 32, 1, false);
      expect(mockCtx.stroke).toHaveBeenCalled();
      mockCtx.stroke.mockClear();
      CanvasExecutor.drawHeartIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      mockCtx.fill.mockClear();
      CanvasExecutor.drawUserIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      mockCtx.fill.mockClear();
      CanvasExecutor.drawSettingsIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      mockCtx.fill.mockClear();
      CanvasExecutor.drawDefaultIcon(mockCtx, 32, 32, 1, true);
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('creates uploads directory when missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await CanvasExecutor.createIcon({ iconType: 'check' });
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('uses filePath for output when provided', async () => {
      const result = await CanvasExecutor.createIcon({ iconType: 'check', filePath: 'icon.png' });
      expect(result.path).toContain('icon.png');
    });
  });

  // ===================== createBanner =====================
  describe('createBanner', () => {
    it('creates a banner with default params', async () => {
      const result = await CanvasExecutor.createBanner({});
      commonResultAssert(result, { width: 800, height: 200 });
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 200);
    });

    it('uses gradient when gradientColors provided', async () => {
      await CanvasExecutor.createBanner({ gradientColors: ['#f00', '#00f'] });
      expect(mockCtx.createLinearGradient).toHaveBeenCalled();
    });

    it('draws stripes pattern', async () => {
      await CanvasExecutor.createBanner({ pattern: 'stripes' });
      expect(mockCtx.beginPath).toHaveBeenCalled();
    });

    it('draws dots pattern', async () => {
      await CanvasExecutor.createBanner({ pattern: 'dots' });
      expect(mockCtx.arc).toHaveBeenCalled();
    });

    it('draws grid pattern', async () => {
      await CanvasExecutor.createBanner({ pattern: 'grid' });
      expect(mockCtx.beginPath).toHaveBeenCalled();
    });

    it('loads background image when path exists', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(true);
      const imgPath = '/tmp/bg.png';
      await CanvasExecutor.createBanner({ backgroundImage: imgPath, width: 800, height: 200 });
      expect(loadImage).toHaveBeenCalledWith(imgPath);
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('warns when background image fails to load', async () => {
      fs.existsSync.mockReturnValueOnce(true);
      loadImage.mockRejectedValueOnce(new Error('corrupt image'));
      await CanvasExecutor.createBanner({ backgroundImage: '/tmp/bg.png' });
      expect(console.warn).toHaveBeenCalled();
    });

    it('creates uploads directory when missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await CanvasExecutor.createBanner({});
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('uses filePath for output and skill name', async () => {
      const result = await CanvasExecutor.createBanner({ filePath: 'banner.png', skill: { name: 'design' } });
      expect(result.path).toContain('banner.png');
    });
  });

  // ===================== editCanvas =====================
  describe('editCanvas', () => {
    it('loads existing image and adds elements', async () => {
      const elements = [{ type: 'text', text: 'edited', x: 10, y: 10, color: '#000' }];
      const result = await CanvasExecutor.editCanvas({ filePath: '/tmp/old.png', elements });
      expect(loadImage).toHaveBeenCalledWith('/tmp/old.png');
      expect(createCanvas).toHaveBeenCalledWith(100, 100);
      expect(mockCtx.drawImage).toHaveBeenCalled();
      commonResultAssert(result, { width: 100, height: 100 });
      expect(result.elementsAdded).toBe(1);
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.editCanvas({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.editCanvas({})).rejects.toThrow('File not found');
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.editCanvas({ filePath: '/tmp/old.png', elements: [] });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== addTextToCanvas =====================
  describe('addTextToCanvas', () => {
    it('adds text to existing image', async () => {
      const result = await CanvasExecutor.addTextToCanvas({ filePath: '/tmp/img.png', text: 'hi', x: 50, y: 50, font: 'bold 24px Arial', color: '#f00' });
      expect(loadImage).toHaveBeenCalled();
      expect(mockCtx.font).toBe('bold 24px Arial');
      expect(mockCtx.fillStyle).toBe('#f00');
      expect(mockCtx.fillText).toHaveBeenCalledWith('hi', 50, 50);
      commonResultAssert(result, { width: 100, height: 100 });
      expect(result.textAdded).toBe('hi');
    });

    it('supports maxWidth parameter', async () => {
      await CanvasExecutor.addTextToCanvas({ filePath: '/tmp/img.png', text: 'long text', maxWidth: 80 });
      expect(mockCtx.fillText).toHaveBeenCalledWith('long text', 100, 100, 80);
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.addTextToCanvas({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.addTextToCanvas({})).rejects.toThrow('File not found');
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.addTextToCanvas({ filePath: '/tmp/img.png', text: 'hi' });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== addShapeToCanvas =====================
  describe('addShapeToCanvas', () => {
    it('adds rectangle shape to existing image', async () => {
      const result = await CanvasExecutor.addShapeToCanvas({ filePath: '/tmp/img.png', shape: 'rectangle', x: 10, y: 20, width: 50, height: 30, color: '#0f0' });
      expect(loadImage).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalledWith(10, 20, 50, 30);
      commonResultAssert(result, { width: 100, height: 100 });
      expect(result.shapeAdded).toBe('rectangle');
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.addShapeToCanvas({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.addShapeToCanvas({})).rejects.toThrow('File not found');
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.addShapeToCanvas({ filePath: '/tmp/img.png', shape: 'rectangle' });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== applyFilter =====================
  describe('applyFilter', () => {
    const mockData = () => {
      const data = new Uint8ClampedArray(40000);
      for (let i = 0; i < 40000; i += 4) { data[i] = 200; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = 255; }
      return { data };
    };

    beforeEach(() => {
      mockCtx.getImageData.mockReturnValue(mockData());
    });

    it('applies grayscale filter', async () => {
      const result = await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'grayscale' });
      expect(result.filterApplied).toBe('grayscale');
      expect(mockCtx.putImageData).toHaveBeenCalled();
      commonResultAssert(result, { width: 100, height: 100 });
    });

    it('applies sepia filter', async () => {
      const result = await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'sepia' });
      expect(result.filterApplied).toBe('sepia');
      expect(mockCtx.putImageData).toHaveBeenCalled();
    });

    it('applies invert filter', async () => {
      const result = await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'invert' });
      expect(result.filterApplied).toBe('invert');
      expect(mockCtx.putImageData).toHaveBeenCalled();
    });

    it('applies brightness filter', async () => {
      const result = await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'brightness', intensity: 0.5 });
      expect(result.filterApplied).toBe('brightness');
      expect(result.intensity).toBe(0.5);
    });

    it('applies contrast filter', async () => {
      const result = await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'contrast' });
      expect(result.filterApplied).toBe('contrast');
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.applyFilter({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.applyFilter({})).rejects.toThrow('File not found');
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.applyFilter({ filePath: '/tmp/img.png', filter: 'grayscale' });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== resizeCanvas =====================
  describe('resizeCanvas', () => {
    it('resizes with aspect ratio maintained (width-constrained)', async () => {
      const result = await CanvasExecutor.resizeCanvas({ filePath: '/tmp/img.png', width: 200, height: 300 });
      expect(createCanvas).toHaveBeenCalled();
      expect(mockCtx.drawImage).toHaveBeenCalled();
      commonResultAssert(result);
      expect(result.originalWidth).toBe(100);
      expect(result.originalHeight).toBe(100);
    });

    it('resizes without maintaining aspect ratio', async () => {
      const _result = await CanvasExecutor.resizeCanvas({ filePath: '/tmp/img.png', width: 200, height: 300, maintainAspectRatio: false });
      expect(createCanvas).toHaveBeenCalledWith(200, 300);
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.resizeCanvas({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.resizeCanvas({})).rejects.toThrow('File not found');
    });

    it('resizes when aspect ratio constraint requires height reduction', async () => {
      const result = await CanvasExecutor.resizeCanvas({ filePath: '/tmp/img.png', width: 300, height: 200 });
      expect(createCanvas).toHaveBeenCalled();
      expect(result.originalHeight).toBe(100);
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.resizeCanvas({ filePath: '/tmp/img.png', width: 200, height: 300 });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== addGradient =====================
  describe('addGradient', () => {
    it('adds linear vertical gradient', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', gradientType: 'linear', direction: 'vertical', colors: ['#f00', '#00f'] });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 100);
      expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('adds linear horizontal gradient', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', gradientType: 'linear', direction: 'horizontal' });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 100, 0);
    });

    it('adds linear diagonal gradient', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', gradientType: 'linear', direction: 'diagonal' });
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 100, 100);
    });

    it('adds radial gradient', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', gradientType: 'radial' });
      expect(mockCtx.createRadialGradient).toHaveBeenCalledWith(50, 50, 0, 50, 50, 50);
    });

    it('handles single color gracefully', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', colors: ['#f00'] });
    });

    it('handles empty colors without color stops', async () => {
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png', colors: [] });
      expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('throws if file not found', async () => {
      fs.existsSync.mockReturnValueOnce(false);
      await expect(CanvasExecutor.addGradient({ filePath: '/tmp/none.png' }))
        .rejects.toThrow('File not found');
    });

    it('throws when filePath is missing', async () => {
      await expect(CanvasExecutor.addGradient({})).rejects.toThrow('File not found');
    });

    it('creates output directory when missing', async () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);
      await CanvasExecutor.addGradient({ filePath: '/tmp/img.png' });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ===================== drawElement =====================
  describe('drawElement', () => {
    it('calls save and restore around drawing', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'circle', x: 10, y: 10, radius: 5 });
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('draws a rectangle (fill + stroke by default)', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'rectangle', x: 0, y: 0, width: 50, height: 30, color: '#f00' });
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 50, 30);
      expect(mockCtx.strokeRect).toHaveBeenCalledWith(0, 0, 50, 30);
    });

    it('draws a rectangle with fill=false (stroke only)', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'rectangle', x: 0, y: 0, width: 50, height: 30, fill: false });
      expect(mockCtx.fillRect).not.toHaveBeenCalled();
      expect(mockCtx.strokeRect).toHaveBeenCalled();
    });

    it('draws a rounded rectangle', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'roundedRectangle', x: 0, y: 0, width: 80, height: 40, radius: 10 });
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalled();
    });

    it('draws a circle', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'circle', x: 50, y: 50, radius: 25 });
      expect(mockCtx.arc).toHaveBeenCalledWith(50, 50, 25, 0, 2 * Math.PI);
    });

    it('draws an ellipse', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'ellipse', x: 50, y: 50, radiusX: 40, radiusY: 20 });
      expect(mockCtx.ellipse).toHaveBeenCalledWith(50, 50, 40, 20, 0, 0, 2 * Math.PI);
    });

    it('draws a triangle', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'triangle', x: 0, y: 0, width: 100, height: 100 });
      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.lineTo).toHaveBeenCalled();
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws a polygon', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'polygon', x: 50, y: 50, radius: 40, sides: 6 });
      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws a star', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'star', x: 50, y: 50, outerRadius: 40, innerRadius: 20, points: 5 });
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws text with font, alignment, and color', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'text', x: 10, y: 20, text: 'hello', font: '16px Arial', color: '#333', align: 'center', baseline: 'middle' });
      expect(mockCtx.font).toBe('16px Arial');
      expect(mockCtx.fillStyle).toBe('#333');
      expect(mockCtx.textAlign).toBe('center');
      expect(mockCtx.textBaseline).toBe('middle');
      expect(mockCtx.fillText).toHaveBeenCalledWith('hello', 10, 20);
    });

    it('draws strokeText', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'strokeText', x: 10, y: 20, text: 'hi', font: '12px Arial', color: '#000' });
      expect(mockCtx.strokeText).toHaveBeenCalledWith('hi', 10, 20);
    });

    it('draws a line', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'line', x: 0, y: 0, x2: 100, y2: 100 });
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(mockCtx.lineTo).toHaveBeenCalledWith(100, 100);
    });

    it('draws a bezier curve', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'bezier', x: 0, y: 0, cp1x: 50, cp1y: -50, cp2x: 100, cp2y: 50, x2: 150, y2: 0 });
      expect(mockCtx.bezierCurveTo).toHaveBeenCalledWith(50, -50, 100, 50, 150, 0);
    });

    it('draws an arc (stroke)', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'arc', x: 50, y: 50, radius: 30, startAngle: 0, endAngle: Math.PI });
      expect(mockCtx.arc).toHaveBeenCalledWith(50, 50, 30, 0, Math.PI);
    });

    it('draws an arcFill', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'arcFill', x: 50, y: 50, radius: 30 });
      expect(mockCtx.arc).toHaveBeenCalledWith(50, 50, 30, 0, Math.PI);
    });

    it('draws an image element from src', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'image', x: 0, y: 0, src: '/tmp/photo.png', width: 50, height: 50, color: '#f00' });
      expect(loadImage).toHaveBeenCalledWith('/tmp/photo.png');
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('warns for unknown element type', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'unknownType', color: '#f00' });
      expect(console.warn).toHaveBeenCalledWith('Unknown element type: unknownType');
    });

    it('applies lineWidth and opacity when provided', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'circle', x: 0, y: 0, lineWidth: 3, opacity: 0.5, color: '#f00' });
      expect(mockCtx.lineWidth).toBe(3);
      expect(mockCtx.globalAlpha).toBe(0.5);
    });

    it('draws circle with fill=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'circle', x: 10, y: 10, radius: 5, fill: false });
      expect(mockCtx.fill).not.toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('draws circle with stroke=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'circle', x: 10, y: 10, radius: 5, stroke: false });
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws ellipse with fill=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'ellipse', x: 50, y: 50, radiusX: 40, radiusY: 20, fill: false });
      expect(mockCtx.fill).not.toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('draws ellipse with stroke=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'ellipse', x: 50, y: 50, radiusX: 40, radiusY: 20, stroke: false });
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws triangle with fill=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'triangle', x: 0, y: 0, width: 100, height: 100, fill: false });
      expect(mockCtx.fill).not.toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('draws triangle with stroke=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'triangle', x: 0, y: 0, width: 100, height: 100, stroke: false });
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws text with maxWidth', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'text', x: 10, y: 20, text: 'long', maxWidth: 80 });
      expect(mockCtx.fillText).toHaveBeenCalledWith('long', 10, 20, 80);
    });

    it('draws text with maxWidth and empty text fallback', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'text', x: 10, y: 20, maxWidth: 80 });
      expect(mockCtx.fillText).toHaveBeenCalledWith('', 10, 20, 80);
    });

    it('draws strokeText with lineWidth', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'strokeText', x: 10, y: 20, text: 'hi', lineWidth: 2 });
      expect(mockCtx.lineWidth).toBe(2);
      expect(mockCtx.strokeText).toHaveBeenCalledWith('hi', 10, 20);
    });

    it('draws line with default endpoints', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'line', x: 0, y: 0 });
      expect(mockCtx.lineTo).toHaveBeenCalledWith(100, 100);
    });

    it('draws bezier with default control points', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'bezier', x: 0, y: 0 });
      expect(mockCtx.bezierCurveTo).toHaveBeenCalled();
    });

    it('draws image with width only', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'image', x: 0, y: 0, src: '/tmp/photo.png', width: 50 });
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('draws image with height only', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'image', x: 0, y: 0, src: '/tmp/photo.png', height: 40 });
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('draws image without dimensions', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'image', x: 0, y: 0, src: '/tmp/photo.png' });
      expect(mockCtx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0);
    });

    it('skips image when src missing', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'image', x: 0, y: 0 });
      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('draws arc with default angles', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'arc', x: 50, y: 50 });
      expect(mockCtx.arc).toHaveBeenCalled();
    });

    it('draws arcFill with default angles', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'arcFill', x: 50, y: 50 });
      expect(mockCtx.arc).toHaveBeenCalled();
    });

    it('draws rectangle with default dimensions and stroke=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'rectangle', x: 0, y: 0 });
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
      expect(mockCtx.strokeRect).toHaveBeenCalledWith(0, 0, 100, 50);
    });

    it('draws rectangle with stroke=false', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'rectangle', x: 0, y: 0, width: 40, height: 20, stroke: false });
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 40, 20);
      expect(mockCtx.strokeRect).not.toHaveBeenCalled();
    });

    it('draws roundedRectangle with default dimensions', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'roundedRectangle', x: 0, y: 0 });
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalled();
    });

    it('draws ellipse with default radii', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'ellipse', x: 50, y: 50 });
      expect(mockCtx.ellipse).toHaveBeenCalledWith(50, 50, 50, 30, 0, 0, 2 * Math.PI);
    });

    it('draws triangle with default dimensions', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'triangle', x: 0, y: 0 });
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws polygon with default radius and sides', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'polygon', x: 50, y: 50 });
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws star with default radii and points', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'star', x: 50, y: 50 });
      expect(mockCtx.closePath).toHaveBeenCalled();
    });

    it('draws text with default props and empty text', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'text', x: 10, y: 20 });
      expect(mockCtx.fillText).toHaveBeenCalledWith('', 10, 20);
    });

    it('draws strokeText with empty text', async () => {
      await CanvasExecutor.drawElement(mockCtx, { type: 'strokeText', x: 10, y: 20 });
      expect(mockCtx.strokeText).toHaveBeenCalledWith('', 10, 20);
    });
  });

  // ===================== drawRoundedRectangle =====================
  describe('drawRoundedRectangle', () => {
    it('draws rounded rectangle with fill and stroke', () => {
      CanvasExecutor.drawRoundedRectangle(mockCtx, 0, 0, 100, 50, 10, true, true);
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('draws rounded rectangle with fill only', () => {
      CanvasExecutor.drawRoundedRectangle(mockCtx, 10, 10, 80, 40, 5, true, false);
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws rounded rectangle with stroke only', () => {
      CanvasExecutor.drawRoundedRectangle(mockCtx, 10, 10, 80, 40, 5, false, true);
      expect(mockCtx.fill).not.toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });
  });

  // ===================== drawPolygon =====================
  describe('drawPolygon', () => {
    it('draws a triangle (3 sides)', () => {
      CanvasExecutor.drawPolygon(mockCtx, 50, 50, 40, 3, true, false);
      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.lineTo).toHaveBeenCalled();
      expect(mockCtx.closePath).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws a hexagon (6 sides) with stroke', () => {
      CanvasExecutor.drawPolygon(mockCtx, 50, 50, 40, 6, false, true);
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.fill).not.toHaveBeenCalled();
    });

    it('returns early when sides < 3', () => {
      CanvasExecutor.drawPolygon(mockCtx, 50, 50, 40, 2, true, true);
      expect(mockCtx.beginPath).not.toHaveBeenCalled();
    });
  });

  // ===================== drawStar =====================
  describe('drawStar', () => {
    it('draws a 5-point star with fill', () => {
      CanvasExecutor.drawStar(mockCtx, 50, 50, 40, 20, 5, true, false);
      expect(mockCtx.closePath).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it('draws a star with stroke only', () => {
      CanvasExecutor.drawStar(mockCtx, 50, 50, 40, 20, 5, false, true);
      expect(mockCtx.fill).not.toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('draws a star with both fill and stroke', () => {
      CanvasExecutor.drawStar(mockCtx, 50, 50, 40, 20, 5, true, true);
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });
  });
});
