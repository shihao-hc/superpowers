// Stage A - Quick validation of executors (Docx, Pdf, Canvas)
const path = require('path');
const fs = require('fs');

const { DocxExecutor } = require('../src/skills/executors/DocxExecutor');
const { PdfExecutor } = require('../src/skills/executors/PdfExecutor');
const { CanvasExecutor } = require('../src/skills/executors/CanvasExecutor');

(async () => {
  console.log('\n=== Stage A Test: Executions ===');
  let summary = { ok: 0, failed: 0, details: [] };

  try {
    // Docx create
    const docxOut = await DocxExecutor.execute({ action: 'create', content: 'Stage A Docx', skill: { name: 'docx' }, filePath: path.join(process.cwd(), 'uploads', 'skills', 'docx', 'stageA-doc.docx')});
    const docxExists = fs.existsSync(docxOut.path);
    summary.ok += docxExists ? 1 : 0; summary.details.push({ name: 'DocxExecutor.create', ok: docxExists, path: docxOut.path, url: docxOut.url });

    // Pdf create
    const pdfOut = await PdfExecutor.execute({ action: 'create', content: 'Stage A Pdf', skill: { name: 'pdf' }, filePath: path.join(process.cwd(), 'uploads', 'skills', 'pdf', 'stageA-pdf.pdf')});
    const pdfExists = fs.existsSync(pdfOut.path);
    summary.ok += pdfExists ? 1 : 0; summary.details.push({ name: 'PdfExecutor.create', ok: pdfExists, path: pdfOut.path, url: pdfOut.url });

    // Canvas create
    const canvasOut = await CanvasExecutor.execute({ action: 'create', width: 320, height: 240, skill: { name: 'canvas-design' }, filePath: path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'stageA-canvas.png'), backgroundColor: '#eeeeee', elements: [] });
    const canvasExists = fs.existsSync(canvasOut.path);
    summary.ok += canvasExists ? 1 : 0; summary.details.push({ name: 'CanvasExecutor.create', ok: canvasExists, path: canvasOut.path, url: canvasOut.url });
  } catch (err) {
    summary.failed += 1;
    summary.details.push({ name: 'StageA-Exception', ok: false, error: err.message });
  }

  console.log('Stage A test summary:', summary);
})();
