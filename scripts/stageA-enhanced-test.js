// Stage A Enhanced - Test enhanced executor features
const path = require('path');
const fs = require('fs');

const { DocxExecutor } = require('../src/skills/executors/DocxExecutor');
const { PdfExecutor } = require('../src/skills/executors/PdfExecutor');
const { CanvasExecutor } = require('../src/skills/executors/CanvasExecutor');

(async () => {
  console.log('\n=== Stage A Enhanced Test: Enhanced Executor Features ===');
  let summary = { ok: 0, failed: 0, details: [] };

  try {
    // Test enhanced DocxExecutor features
    console.log('\n1. Testing DocxExecutor enhanced features...');
    
    // 1.1 Create document with headings
    const docxHeadingOut = await DocxExecutor.execute({
      action: 'createWithHeadings',
      title: 'Enhanced Document Test',
      headings: [
        { level: 1, text: 'Introduction', content: 'This is a test document with enhanced features.' },
        { level: 2, text: 'Features', content: 'Testing headings, tables, and images.' },
        { level: 3, text: 'Sub-features', content: 'Detailed testing of sub-sections.' }
      ],
      author: 'UltraWork Test',
      skill: { name: 'docx' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'docx', 'stageA-enhanced-heading.docx')
    });
    
    const headingExists = fs.existsSync(docxHeadingOut.path);
    summary.ok += headingExists ? 1 : 0;
    summary.details.push({ 
      name: 'DocxExecutor.createWithHeadings', 
      ok: headingExists, 
      path: docxHeadingOut.path,
      headingsCount: docxHeadingOut.headingsCount
    });
    
    // 1.2 Create document with table
    const docxTableOut = await DocxExecutor.execute({
      action: 'createWithTable',
      title: 'Table Test Document',
      headers: ['Name', 'Age', 'City', 'Role'],
      tableData: [
        ['Alice', 28, 'New York', 'Engineer'],
        ['Bob', 32, 'London', 'Designer'],
        ['Charlie', 25, 'Tokyo', 'Manager'],
        ['Diana', 30, 'Paris', 'Developer']
      ],
      author: 'UltraWork Test',
      skill: { name: 'docx' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'docx', 'stageA-enhanced-table.docx')
    });
    
    const tableExists = fs.existsSync(docxTableOut.path);
    summary.ok += tableExists ? 1 : 0;
    summary.details.push({ 
      name: 'DocxExecutor.createWithTable', 
      ok: tableExists, 
      path: docxTableOut.path,
      tableRows: docxTableOut.tableRows,
      tableColumns: docxTableOut.tableColumns
    });
    
    // 1.3 Create professional report
    const docxReportOut = await DocxExecutor.execute({
      action: 'createReport',
      title: 'UltraWork Platform Report',
      author: 'UltraWork Test Team',
      date: '2026-03-21',
      abstract: 'This report demonstrates the enhanced document creation capabilities of the UltraWork skill system.',
      sections: [
        {
          title: 'Executive Summary',
          content: 'The UltraWork platform has been enhanced with advanced document generation features.',
          level: 1
        },
        {
          title: 'Technical Implementation',
          content: 'The DocxExecutor now supports creating complex documents with tables, headings, and images.',
          level: 1,
          subsections: [
            {
              title: 'Heading Support',
              content: 'Documents can now have multiple heading levels with proper formatting.'
            },
            {
              title: 'Table Support',
              content: 'Tables are automatically formatted with headers and alternating row colors.'
            }
          ]
        },
        {
          title: 'Future Enhancements',
          content: 'Future versions will add support for more complex layouts and template systems.',
          level: 1
        }
      ],
      conclusion: 'The enhanced document generation capabilities significantly improve the quality of generated documents.',
      includeToc: true,
      skill: { name: 'docx' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'docx', 'stageA-enhanced-report.docx')
    });
    
    const reportExists = fs.existsSync(docxReportOut.path);
    summary.ok += reportExists ? 1 : 0;
    summary.details.push({ 
      name: 'DocxExecutor.createReport', 
      ok: reportExists, 
      path: docxReportOut.path,
      sectionsCount: docxReportOut.sectionsCount
    });
    
    // Test enhanced PdfExecutor features
    console.log('\n2. Testing PdfExecutor enhanced features...');
    
    // 2.1 Create PDF with table
    const pdfTableOut = await PdfExecutor.execute({
      action: 'createWithTable',
      title: 'PDF Table Test',
      headers: ['Product', 'Price', 'Quantity', 'Total'],
      tableData: [
        ['Laptop', '$999', '2', '$1998'],
        ['Mouse', '$25', '5', '$125'],
        ['Keyboard', '$75', '3', '$225'],
        ['Monitor', '$299', '1', '$299']
      ],
      skill: { name: 'pdf' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'pdf', 'stageA-enhanced-table.pdf')
    });
    
    const pdfTableExists = fs.existsSync(pdfTableOut.path);
    summary.ok += pdfTableExists ? 1 : 0;
    summary.details.push({ 
      name: 'PdfExecutor.createWithTable', 
      ok: pdfTableExists, 
      path: pdfTableOut.path,
      tableRows: pdfTableOut.tableRows,
      tableColumns: pdfTableOut.tableColumns
    });
    
    // 2.2 Create PDF invoice
    const pdfInvoiceOut = await PdfExecutor.execute({
      action: 'createInvoice',
      invoiceNumber: 'INV-2026-001',
      date: 'March 21, 2026',
      dueDate: 'April 20, 2026',
      from: {
        'Company': 'UltraWork Inc.',
        'Address': '123 Tech Street',
        'City': 'San Francisco, CA',
        'Email': 'billing@ultrawork.com'
      },
      to: {
        'Company': 'Client Corp',
        'Address': '456 Business Ave',
        'City': 'New York, NY',
        'Email': 'accounts@clientcorp.com'
      },
      items: [
        { description: 'UltraWork Pro License', quantity: 1, price: 499 },
        { description: 'Implementation Services', quantity: 40, price: 150 },
        { description: 'Training Sessions', quantity: 4, price: 250 }
      ],
      tax: 8.5,
      notes: 'Thank you for your business! Payment due within 30 days.',
      skill: { name: 'pdf' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'pdf', 'stageA-enhanced-invoice.pdf')
    });
    
    const invoiceExists = fs.existsSync(pdfInvoiceOut.path);
    summary.ok += invoiceExists ? 1 : 0;
    summary.details.push({ 
      name: 'PdfExecutor.createInvoice', 
      ok: invoiceExists, 
      path: pdfInvoiceOut.path,
      invoiceNumber: pdfInvoiceOut.invoiceNumber,
      itemsCount: pdfInvoiceOut.itemsCount
    });
    
    // Test enhanced CanvasExecutor features
    console.log('\n3. Testing CanvasExecutor enhanced features...');
    
    // 3.1 Create chart
    const chartOut = await CanvasExecutor.execute({
      action: 'createChart',
      chartType: 'bar',
      data: [65, 59, 80, 81, 56, 55, 40],
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      colors: ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722'],
      title: 'Weekly Sales Performance',
      width: 800,
      height: 600,
      showLegend: true,
      showValues: true,
      skill: { name: 'canvas-design' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'stageA-chart.png')
    });
    
    const chartExists = fs.existsSync(chartOut.path);
    summary.ok += chartExists ? 1 : 0;
    summary.details.push({ 
      name: 'CanvasExecutor.createChart', 
      ok: chartExists, 
      path: chartOut.path,
      chartType: chartOut.chartType,
      dataPoints: chartOut.dataPoints
    });
    
    // 3.2 Create icon
    const iconOut = await CanvasExecutor.execute({
      action: 'createIcon',
      iconType: 'star',
      size: 128,
      color: '#FFD700',
      backgroundColor: 'transparent',
      fill: true,
      skill: { name: 'canvas-design' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'stageA-icon.png')
    });
    
    const iconExists = fs.existsSync(iconOut.path);
    summary.ok += iconExists ? 1 : 0;
    summary.details.push({ 
      name: 'CanvasExecutor.createIcon', 
      ok: iconExists, 
      path: iconOut.path,
      iconType: iconOut.iconType,
      size: iconOut.size
    });
    
    // 3.3 Create banner
    const bannerOut = await CanvasExecutor.execute({
      action: 'createBanner',
      text: 'UltraWork Enhanced',
      width: 1000,
      height: 200,
      backgroundColor: '#2196F3',
      textColor: '#ffffff',
      fontSize: 48,
      fontFamily: 'Arial',
      gradientColors: ['#1976D2', '#42A5F5'],
      pattern: 'stripes',
      skill: { name: 'canvas-design' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'stageA-banner.png')
    });
    
    const bannerExists = fs.existsSync(bannerOut.path);
    summary.ok += bannerExists ? 1 : 0;
    summary.details.push({ 
      name: 'CanvasExecutor.createBanner', 
      ok: bannerExists, 
      path: bannerOut.path,
      width: bannerOut.width,
      height: bannerOut.height,
      text: bannerOut.text
    });
    
    // Test SkillNodeDefinitions
    console.log('\n4. Testing SkillNodeDefinitions...');
    const { SkillNodeDefinitions } = require('../src/skills/SkillNodeDefinitions');
    
    const docxDefinition = SkillNodeDefinitions.getNodeDefinition('docx');
    const pdfDefinition = SkillNodeDefinitions.getNodeDefinition('pdf');
    const canvasDefinition = SkillNodeDefinitions.getNodeDefinition('canvas-design');
    
    const definitionsExist = docxDefinition && pdfDefinition && canvasDefinition;
    summary.ok += definitionsExist ? 1 : 0;
    summary.details.push({ 
      name: 'SkillNodeDefinitions', 
      ok: definitionsExist, 
      docxActions: docxDefinition ? docxDefinition.actions.length : 0,
      pdfActions: pdfDefinition ? pdfDefinition.actions.length : 0,
      canvasActions: canvasDefinition ? canvasDefinition.actions.length : 0
    });
    
  } catch (err) {
    summary.failed += 1;
    summary.details.push({ name: 'StageA-Enhanced-Exception', ok: false, error: err.message });
    console.error('Test error:', err);
  }

  console.log('\n=== Stage A Enhanced Test Summary ===');
  console.log(`Total tests: ${summary.ok + summary.failed}`);
  console.log(`Passed: ${summary.ok}`);
  console.log(`Failed: ${summary.failed}`);
  console.log('Success rate:', `${((summary.ok / (summary.ok + summary.failed)) * 100).toFixed(1)}%`);
  
  console.log('\nDetailed Results:');
  summary.details.forEach(detail => {
    console.log(`  ${detail.name}: ${detail.ok ? '✓ PASS' : '✗ FAIL'}`);
    if (!detail.ok && detail.error) {
      console.log(`    Error: ${detail.error}`);
    }
    if (detail.path) {
      console.log(`    Path: ${detail.path}`);
    }
  });
  
  console.log('\n=== End of Stage A Enhanced Test ===');
})();