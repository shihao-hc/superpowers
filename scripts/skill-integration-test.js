// Skill Integration Test - End-to-end testing of enhanced skill system
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('\n=== Skill Integration Test ===');
  let summary = { ok: 0, failed: 0, details: [] };

  try {
    // 1. Test SkillLoader
    console.log('\n1. Testing SkillLoader...');
    const { SkillLoader } = require('../src/skills/SkillLoader');
    const loader = new SkillLoader();
    const skills = loader.loadAll();
    
    console.log(`Loaded ${skills.length} skills`);
    summary.ok += skills.length > 0 ? 1 : 0;
    summary.details.push({
      name: 'SkillLoader.loadAll',
      ok: skills.length > 0,
      skillsLoaded: skills.length
    });
    
    // 2. Test SkillNodeDefinitions
    console.log('\n2. Testing SkillNodeDefinitions...');
    const { SkillNodeDefinitions } = require('../src/skills/SkillNodeDefinitions');
    const allDefinitions = SkillNodeDefinitions.getAllNodeDefinitions();
    const definitionCount = Object.keys(allDefinitions).length;
    
    console.log(`Found ${definitionCount} node definitions`);
    summary.ok += definitionCount > 0 ? 1 : 0;
    summary.details.push({
      name: 'SkillNodeDefinitions.getAllNodeDefinitions',
      ok: definitionCount > 0,
      definitionsCount: definitionCount
    });
    
    // 3. Test enhanced executors with multiple features
    console.log('\n3. Testing enhanced executors integration...');
    const { DocxExecutor } = require('../src/skills/executors/DocxExecutor');
    const { PdfExecutor } = require('../src/skills/executors/PdfExecutor');
    const { CanvasExecutor } = require('../src/skills/executors/CanvasExecutor');
    
    // Test docx report creation
    const docxReport = await DocxExecutor.execute({
      action: 'createReport',
      title: 'Integration Test Report',
      sections: [
        { title: 'Test Section', content: 'This is a test section.', level: 1 }
      ],
      skill: { name: 'docx' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'docx', 'integration-report.docx')
    });
    
    const docxReportExists = fs.existsSync(docxReport.path);
    summary.ok += docxReportExists ? 1 : 0;
    summary.details.push({
      name: 'DocxExecutor.createReport Integration',
      ok: docxReportExists,
      path: docxReport.path
    });
    
    // Test pdf invoice creation
    const pdfInvoice = await PdfExecutor.execute({
      action: 'createInvoice',
      invoiceNumber: 'INT-TEST-001',
      date: '2026-03-21',
      from: { Company: 'Test Company' },
      to: { Company: 'Client Company' },
      items: [{ description: 'Test Item', quantity: 1, price: 100 }],
      skill: { name: 'pdf' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'pdf', 'integration-invoice.pdf')
    });
    
    const pdfInvoiceExists = fs.existsSync(pdfInvoice.path);
    summary.ok += pdfInvoiceExists ? 1 : 0;
    summary.details.push({
      name: 'PdfExecutor.createInvoice Integration',
      ok: pdfInvoiceExists,
      path: pdfInvoice.path
    });
    
    // Test canvas chart creation
    const canvasChart = await CanvasExecutor.execute({
      action: 'createChart',
      chartType: 'pie',
      data: [30, 20, 50],
      labels: ['Category A', 'Category B', 'Category C'],
      title: 'Integration Test Chart',
      skill: { name: 'canvas-design' },
      filePath: path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'integration-chart.png')
    });
    
    const canvasChartExists = fs.existsSync(canvasChart.path);
    summary.ok += canvasChartExists ? 1 : 0;
    summary.details.push({
      name: 'CanvasExecutor.createChart Integration',
      ok: canvasChartExists,
      path: canvasChart.path
    });
    
    // 4. Test SkillToNode conversion
    console.log('\n4. Testing SkillToNode conversion...');
    const { SkillToNode } = require('../src/skills/SkillToNode');
    const { NodeWorkflowEngine } = require('../src/workflow/NodeWorkflowEngine');
    
    // Create a mock workflow engine
    const mockWorkflowEngine = {
      registerNodeType: (name, nodeType) => {
        console.log(`Registered node type: ${name}`);
        return true;
      }
    };
    
    const skillToNode = new SkillToNode(mockWorkflowEngine, null, loader);
    
    // Test converting docx skill
    try {
      const docxNode = await skillToNode.convertSkillToNodes('docx');
      summary.ok += 1;
      summary.details.push({
        name: 'SkillToNode.convertSkillToNodes (docx)',
        ok: true,
        nodesConverted: Array.isArray(docxNode) ? docxNode.length : 1
      });
    } catch (error) {
      summary.failed += 1;
      summary.details.push({
        name: 'SkillToNode.convertSkillToNodes (docx)',
        ok: false,
        error: error.message
      });
    }
    
    // 5. Test MCP generation (without actual server startup)
    console.log('\n5. Testing MCP tool generation...');
    const { SkillMCPGenerator } = require('../src/skills/mcp/SkillMCPGenerator');
    const mcpGenerator = new SkillMCPGenerator();
    
    // Generate MCP config for docx skill
    const docxSkill = loader.getSkill('docx');
    if (docxSkill) {
      const mcpConfig = mcpGenerator.generateMCPConfig(docxSkill);
      const scriptPath = mcpConfig.args[0];
      const scriptExists = fs.existsSync(scriptPath);
      
      summary.ok += scriptExists ? 1 : 0;
      summary.details.push({
        name: 'SkillMCPGenerator.generateMCPConfig (docx)',
        ok: scriptExists,
        scriptPath: scriptPath,
        serverName: mcpConfig.name
      });
      
      // Read and verify the generated script
      if (scriptExists) {
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        const hasCorrectStructure = scriptContent.includes('SkillMCPServer') && 
                                   scriptContent.includes('handleMessage') &&
                                   scriptContent.includes('executeTool');
        
        summary.ok += hasCorrectStructure ? 1 : 0;
        summary.details.push({
          name: 'Generated MCP Script Structure',
          ok: hasCorrectStructure,
          scriptLength: scriptContent.length
        });
      }
    }
    
    // 6. Verify outputs directory structure
    console.log('\n6. Verifying output directory structure...');
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills');
    const skillsDirs = ['docx', 'pdf', 'canvas-design'];
    
    let dirsExist = true;
    for (const dir of skillsDirs) {
      const dirPath = path.join(uploadsDir, dir);
      if (!fs.existsSync(dirPath)) {
        dirsExist = false;
        break;
      }
    }
    
    summary.ok += dirsExist ? 1 : 0;
    summary.details.push({
      name: 'Output Directory Structure',
      ok: dirsExist,
      uploadsDir: uploadsDir
    });
    
    // 7. Test file cleanup
    console.log('\n7. Testing file cleanup...');
    const filesToCheck = [
      path.join(process.cwd(), 'uploads', 'skills', 'docx', 'stageA-doc.docx'),
      path.join(process.cwd(), 'uploads', 'skills', 'pdf', 'stageA-pdf.pdf'),
      path.join(process.cwd(), 'uploads', 'skills', 'canvas-design', 'stageA-canvas.png')
    ];
    
    let allFilesExist = true;
    for (const file of filesToCheck) {
      if (!fs.existsSync(file)) {
        allFilesExist = false;
        break;
      }
    }
    
    summary.ok += allFilesExist ? 1 : 0;
    summary.details.push({
      name: 'Test Files Existence',
      ok: allFilesExist,
      filesChecked: filesToCheck.length
    });
    
    // Clean up MCP generator
    mcpGenerator.cleanup();
    
  } catch (err) {
    summary.failed += 1;
    summary.details.push({ name: 'Integration-Test-Exception', ok: false, error: err.message });
    console.error('Integration test error:', err);
  }

  console.log('\n=== Integration Test Summary ===');
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
    if (detail.scriptPath) {
      console.log(`    Script: ${detail.scriptPath}`);
    }
  });
  
  console.log('\n=== End of Integration Test ===');
})();