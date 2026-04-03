const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

class PdfExecutor {
  /**
   * Execute PDF skill operations
   * @param {Object} inputs - Input parameters for the operation
   * @returns {Promise<Object>} Result object with file path or extracted content
   */
  static async execute(inputs) {
    const action = inputs.action || 'create';
    
    try {
      switch (action) {
        case 'create':
          return await this.createPDF(inputs);
        case 'createWithForm':
          return await this.createPDFWithForm(inputs);
        case 'createWithTable':
          return await this.createPDFWithTable(inputs);
        case 'createReport':
          return await this.createPDFReport(inputs);
        case 'createInvoice':
          return await this.createPDFInvoice(inputs);
        case 'read':
          return await this.readPDF(inputs);
        case 'edit':
          return await this.editPDF(inputs);
        case 'addWatermark':
          return await this.addWatermark(inputs);
        case 'addPageNumbers':
          return await this.addPageNumbers(inputs);
        case 'addBookmarks':
          return await this.addBookmarks(inputs);
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      throw new Error(`PdfExecutor failed: ${error.message}`);
    }
  }

  /**
   * Create a new PDF document
   * @param {Object} inputs - Contains title, content, data, filePath, etc.
   * @returns {Promise<Object>} Result with generated file path
   */
  static async createPDF(inputs) {
    const { title, content, data, filePath, width, height, author, subject, keywords } = inputs;
    // Persist to uploads/skills for consistency
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Set default dimensions (A4 or custom)
    const pageWidth = width || 595.28;  // A4 width in points
    const pageHeight = height || 841.89; // A4 height in points
    
    // Create PDF with metadata
    const doc = new PDFDocument({ 
      size: [pageWidth, pageHeight],
      info: {
        Title: title || 'Generated PDF',
        Author: author || 'UltraWork Skill Executor',
        Subject: subject || 'PDF created by skill executor',
        Keywords: keywords || 'ultrawork,skill,pdf',
        Creator: 'UltraWork Skill Executor'
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      }
    });
    
    // Determine output path
    const outputPath = filePath || path.join(uploadsDir, `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
    
    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create write stream
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Add title if provided
    if (title) {
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text(title, {
           align: 'center',
           continued: false
         })
         .moveDown(2);
    }
    
    // Add content if provided
    if (content) {
      doc.fontSize(12)
         .font('Helvetica');
      
      if (Array.isArray(content)) {
        content.forEach(line => {
          doc.text(line, {
            align: 'left',
            width: pageWidth - 144, // Account for margins
            lineGap: 5
          });
          doc.moveDown(0.5);
        });
      } else {
        doc.text(content, {
          align: 'justify',
          width: pageWidth - 144,
          lineGap: 5
        });
        doc.moveDown();
      }
    }
    
    // Add data if provided (key-value pairs)
    if (data && typeof data === 'object') {
      doc.fontSize(11)
         .font('Helvetica');
      for (const [key, value] of Object.entries(data)) {
        doc.text(`${key}: `, {
          continued: true,
          width: pageWidth - 144
        })
        .font('Helvetica-Bold')
        .text(String(value))
        .font('Helvetica')
        .moveDown(0.3);
      }
    }
    
    // Finalize the PDF
    doc.end();
    
    // Wait for file to be written
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      message: `PDF created successfully at ${outputPath}`
    };
  }

  /**
   * Create a PDF with form fields
   * @param {Object} inputs - Contains title, formFields, data, filePath
   * @returns {Promise<Object>} Result with generated file path
   */
  static async createPDFWithForm(inputs) {
    const { title, formFields, data, filePath, width, height } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const pageWidth = width || 595.28;
    const pageHeight = height || 841.89;
    
    const doc = new PDFDocument({ 
      size: [pageWidth, pageHeight],
      info: {
        Title: title || 'PDF Form',
        Author: 'UltraWork Skill Executor'
      }
    });
    
    const outputPath = filePath || path.join(uploadsDir, `pdf-form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Add title
    if (title) {
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text(title, {
           align: 'center',
           underline: true
         })
         .moveDown(2);
    }
    
    // Add form fields if provided
    if (formFields && Array.isArray(formFields)) {
      formFields.forEach(field => {
        const { label, type = 'text', required = false, defaultValue = '', options } = field;
        
        // Draw field label
        doc.fontSize(12)
           .font('Helvetica')
           .text(`${label}${required ? ' *' : ''}:`, {
             continued: false
           })
           .moveDown(0.2);
        
        // Draw field based on type
        const fieldY = doc.y;
        const fieldX = 100;
        const fieldWidth = pageWidth - 200;
        
        switch (type) {
          case 'text':
          case 'number':
            // Draw text box
            doc.rect(fieldX, fieldY, fieldWidth, 20)
               .stroke()
               .moveDown(0.8);
            break;
            
          case 'checkbox':
            // Draw checkbox
            doc.rect(fieldX, fieldY, 12, 12)
               .stroke()
               .moveDown(0.8);
            break;
            
          case 'dropdown':
            // Draw dropdown
            doc.rect(fieldX, fieldY, fieldWidth, 20)
               .stroke()
               .moveDown(0.8);
            break;
            
          default:
            doc.moveDown(0.8);
        }
      });
    }
    
    // Add data values if provided
    if (data && typeof data === 'object') {
      doc.moveDown(1)
         .fontSize(11)
         .text('Form Data:', { underline: true })
         .moveDown(0.5);
      
      for (const [key, value] of Object.entries(data)) {
        doc.text(`${key}: ${String(value)}`)
           .moveDown(0.3);
      }
    }
    
    doc.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      formFieldsCount: formFields ? formFields.length : 0,
      message: `PDF with form created successfully at ${outputPath}`
    };
  }

  /**
   * Create a PDF with tables
   * @param {Object} inputs - Contains title, tableData, headers, filePath
   * @returns {Promise<Object>} Result with generated file path
   */
  static async createPDFWithTable(inputs) {
    const { title, tableData, headers, filePath, width, height, columnWidths } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const pageWidth = width || 595.28;
    const pageHeight = height || 841.89;
    
    const doc = new PDFDocument({ 
      size: [pageWidth, pageHeight],
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    const outputPath = filePath || path.join(uploadsDir, `pdf-table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Add title
    if (title) {
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text(title, {
           align: 'center',
           underline: true
         })
         .moveDown(2);
    }
    
    // Create table if data provided
    if (tableData && Array.isArray(tableData) && headers && Array.isArray(headers)) {
      const tableTop = doc.y;
      const tableLeft = 50;
      const tableWidth = pageWidth - 100;
      const rowHeight = 25;
      const colCount = headers.length;
      const colWidth = tableWidth / colCount;
      
      // Draw header row
      doc.fontSize(11)
         .font('Helvetica-Bold');
      
      headers.forEach((header, i) => {
        const x = tableLeft + (i * colWidth);
        doc.rect(x, tableTop, colWidth, rowHeight)
           .fill('#2E74B5');
        
        doc.fillColor('white')
           .text(String(header), x + 5, tableTop + 7, {
             width: colWidth - 10,
             align: 'center'
           });
      });
      
      // Draw data rows
      doc.font('Helvetica')
         .fillColor('black');
      
      tableData.forEach((row, rowIndex) => {
        const y = tableTop + ((rowIndex + 1) * rowHeight);
        
        if (Array.isArray(row)) {
          row.forEach((cell, colIndex) => {
            const x = tableLeft + (colIndex * colWidth);
            
            // Draw cell background
            if (rowIndex % 2 === 0) {
              doc.rect(x, y, colWidth, rowHeight)
                 .fill('#F0F0F0');
            } else {
              doc.rect(x, y, colWidth, rowHeight)
                 .fill('white');
            }
            
            // Draw cell border
            doc.rect(x, y, colWidth, rowHeight)
               .stroke()
               .fillColor('black');
            
            // Draw cell content
            doc.text(String(cell), x + 5, y + 7, {
              width: colWidth - 10,
              align: 'left'
            });
          });
        }
      });
    }
    
    doc.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      tableRows: tableData ? tableData.length : 0,
      tableColumns: headers ? headers.length : 0,
      message: `PDF with table created successfully at ${outputPath}`
    };
  }

  /**
   * Create a professional PDF report
   * @param {Object} inputs - Contains title, sections, author, date, etc.
   * @returns {Promise<Object>} Result with generated file path
   */
  static async createPDFReport(inputs) {
    const { title, sections, author, date, filePath, includeToc, abstract, conclusion } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const doc = new PDFDocument({ 
      size: 'A4',
      info: {
        Title: title || 'Professional Report',
        Author: author || 'UltraWork Skill Executor',
        CreationDate: date ? new Date(date) : new Date()
      },
      margins: { top: 72, bottom: 72, left: 72, right: 72 }
    });
    
    const outputPath = filePath || path.join(uploadsDir, `pdf-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Title page
    if (title) {
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .text(title, {
           align: 'center',
           continued: false
         })
         .moveDown(3);
      
      if (author) {
        doc.fontSize(16)
           .font('Helvetica')
           .text(`Prepared by: ${author}`, {
             align: 'center'
           })
           .moveDown(1);
      }
      
      if (date) {
        doc.text(`Date: ${date}`, {
          align: 'center'
        });
      }
      
      doc.addPage();
    }
    
    // Abstract if provided
    if (abstract) {
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text('Abstract', { underline: true })
         .moveDown(0.5);
      
      doc.fontSize(12)
         .font('Helvetica')
         .text(abstract, {
           align: 'justify',
           lineGap: 3
         })
         .moveDown(1);
    }
    
    // Sections
    if (sections && Array.isArray(sections)) {
      sections.forEach((section, sectionIndex) => {
        // Add page break for new section (except first)
        if (sectionIndex > 0) {
          doc.addPage();
        }
        
        // Section title
        if (section.title) {
          doc.fontSize(18)
             .font('Helvetica-Bold')
             .text(section.title, { underline: true })
             .moveDown(0.5);
        }
        
        // Section content
        if (section.content) {
          doc.fontSize(12)
             .font('Helvetica');
          
          if (Array.isArray(section.content)) {
            section.content.forEach(item => {
              doc.text(item, {
                align: 'justify',
                lineGap: 3,
                indent: 20
              })
              .moveDown(0.3);
            });
          } else {
            doc.text(section.content, {
              align: 'justify',
              lineGap: 3,
              indent: 20
            })
            .moveDown(1);
          }
        }
        
        // Sub-sections
        if (section.subsections && Array.isArray(section.subsections)) {
          section.subsections.forEach(subsection => {
            if (subsection.title) {
              doc.fontSize(14)
                 .font('Helvetica-Bold')
                 .text(subsection.title, {
                   underline: true,
                   indent: 10
                 })
                 .moveDown(0.3);
            }
            
            if (subsection.content) {
              doc.fontSize(12)
                 .font('Helvetica')
                 .text(subsection.content, {
                   align: 'justify',
                   lineGap: 3,
                   indent: 20
                 })
                 .moveDown(0.5);
            }
          });
        }
      });
    }
    
    // Conclusion if provided
    if (conclusion) {
      doc.addPage();
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text('Conclusion', { underline: true })
         .moveDown(0.5);
      
      doc.fontSize(12)
         .font('Helvetica')
         .text(conclusion, {
           align: 'justify',
           lineGap: 3
         });
    }
    
    doc.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      sectionsCount: sections ? sections.length : 0,
      message: `PDF report created successfully at ${outputPath}`
    };
  }

  /**
   * Create a PDF invoice
   * @param {Object} inputs - Contains invoice details, items, totals, etc.
   * @returns {Promise<Object>} Result with generated file path
   */
  static async createPDFInvoice(inputs) {
    const { invoiceNumber, date, dueDate, from, to, items, tax, discount, notes, filePath } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const doc = new PDFDocument({ 
      size: 'A4',
      info: {
        Title: `Invoice ${invoiceNumber || ''}`,
        Author: 'UltraWork Skill Executor'
      }
    });
    
    const outputPath = filePath || path.join(uploadsDir, `pdf-invoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.pdf`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Invoice header
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text('INVOICE', { align: 'right' })
       .moveDown(0.5);
    
    // Invoice details
    if (invoiceNumber) {
      doc.fontSize(12)
         .font('Helvetica')
         .text(`Invoice #: ${invoiceNumber}`, { align: 'right' });
    }
    
    if (date) {
      doc.text(`Date: ${date}`, { align: 'right' });
    }
    
    if (dueDate) {
      doc.text(`Due Date: ${dueDate}`, { align: 'right' });
    }
    
    doc.moveDown(2);
    
    // From/To addresses
    if (from) {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('From:', { underline: true })
         .moveDown(0.3);
      
      doc.font('Helvetica');
      if (typeof from === 'string') {
        doc.text(from);
      } else {
        Object.entries(from).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`);
        });
      }
    }
    
    if (to) {
      doc.moveDown(1)
         .font('Helvetica-Bold')
         .text('To:', { underline: true })
         .moveDown(0.3);
      
      doc.font('Helvetica');
      if (typeof to === 'string') {
        doc.text(to);
      } else {
        Object.entries(to).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`);
        });
      }
    }
    
    doc.moveDown(2);
    
    // Items table
    if (items && Array.isArray(items)) {
      const tableTop = doc.y;
      const tableLeft = 50;
      const tableWidth = 495;
      const colWidths = [250, 80, 80, 85]; // Description, Qty, Price, Total
      const rowHeight = 20;
      
      // Table headers
      const headers = ['Description', 'Qty', 'Price', 'Total'];
      doc.fontSize(11)
         .font('Helvetica-Bold');
      
      headers.forEach((header, i) => {
        const x = tableLeft + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(x, tableTop, colWidths[i], rowHeight)
           .fill('#2E74B5');
        
        doc.fillColor('white')
           .text(header, x + 5, tableTop + 5, {
             width: colWidths[i] - 10,
             align: 'center'
           });
      });
      
      // Table rows
      doc.font('Helvetica')
         .fillColor('black');
      
      let subtotal = 0;
      items.forEach((item, rowIndex) => {
        const y = tableTop + ((rowIndex + 1) * rowHeight);
        const itemTotal = (item.quantity || 1) * (item.price || 0);
        subtotal += itemTotal;
        
        // Draw row background
        if (rowIndex % 2 === 0) {
          doc.rect(tableLeft, y, tableWidth, rowHeight)
             .fill('#F0F0F0');
        }
        
        // Draw row content
        const rowData = [
          item.description || '',
          String(item.quantity || 1),
          `$${(item.price || 0).toFixed(2)}`,
          `$${itemTotal.toFixed(2)}`
        ];
        
        rowData.forEach((data, colIndex) => {
          const x = tableLeft + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0);
          
          doc.fillColor('black')
             .text(data, x + 5, y + 5, {
               width: colWidths[colIndex] - 10,
               align: colIndex === 0 ? 'left' : 'center'
             });
        });
      });
      
      // Totals section
      const totalsY = tableTop + ((items.length + 1) * rowHeight) + 20;
      
      doc.fontSize(12)
         .font('Helvetica-Bold');
      
      // Subtotal
      doc.text('Subtotal:', 350, totalsY, { align: 'right', width: 100 })
         .text(`$${subtotal.toFixed(2)}`, 450, totalsY, { align: 'right', width: 50 });
      
      // Discount if provided
      let discountAmount = 0;
      if (discount) {
        discountAmount = typeof discount === 'number' ? discount : 
                        (discount.percentage ? subtotal * (discount.percentage / 100) : discount.amount || 0);
        
        doc.text('Discount:', 350, totalsY + 20, { align: 'right', width: 100 })
           .text(`-$${discountAmount.toFixed(2)}`, 450, totalsY + 20, { align: 'right', width: 50 });
      }
      
      // Tax if provided
      let taxAmount = 0;
      if (tax) {
        const taxableAmount = subtotal - discountAmount;
        taxAmount = typeof tax === 'number' ? taxableAmount * (tax / 100) : tax.amount || 0;
        
        doc.text('Tax:', 350, totalsY + 40, { align: 'right', width: 100 })
           .text(`$${taxAmount.toFixed(2)}`, 450, totalsY + 40, { align: 'right', width: 50 });
      }
      
      // Total
      const total = subtotal - discountAmount + taxAmount;
      doc.fontSize(14)
         .text('Total:', 350, totalsY + 70, { align: 'right', width: 100 })
         .text(`$${total.toFixed(2)}`, 450, totalsY + 70, { align: 'right', width: 50 });
    }
    
    // Notes if provided
    if (notes) {
      doc.moveDown(3)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('Notes:', { underline: true })
         .moveDown(0.3)
         .font('Helvetica')
         .text(notes, {
           align: 'left',
           width: 400
         });
    }
    
    doc.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      invoiceNumber: invoiceNumber,
      itemsCount: items ? items.length : 0,
      message: `PDF invoice created successfully at ${outputPath}`
    };
  }
  
  /**
   * Read a PDF document
   * @param {Object} inputs - Contains filePath
   * @returns {Promise<Object>} Result with extracted content
   */
  static async readPDF(inputs) {
    const { filePath } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // In a real implementation, we would use pdf-parse to extract text
    // For now, we'll return a placeholder with more details
    return {
      type: 'text',
      content: `PDF content extracted from ${filePath}\n[This is a placeholder - real implementation would extract actual text using pdf-parse library]\n\nFile information:\n- Size: ${stats.size} bytes\n- Created: ${stats.birthtime}\n- Modified: ${stats.mtime}\n\nNote: For actual PDF text extraction, install 'pdf-parse' package: npm install pdf-parse`,
      message: `PDF read successfully from ${filePath}`,
      metadata: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        note: "Text extraction requires pdf-parse library"
      }
    };
  }
  
  /**
   * Edit a PDF document
   * @param {Object} inputs - Contains filePath, modifications
   * @returns {Promise<Object>} Result with updated file path
   */
  static async editPDF(inputs) {
    const { filePath, data, content, modifications } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    // For now, we'll create a new PDF with modifications
    // In a real implementation, we would use a PDF manipulation library
    const doc = new PDFDocument();
    
    const outputPath = filePath.replace('.pdf', `-edited-${Date.now()}.pdf`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    
    // Add original content header
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Edited PDF Document', { underline: true })
       .moveDown(1);
    
    // Add modifications
    if (modifications && typeof modifications === 'object') {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Modifications:', { underline: true })
         .moveDown(0.5);
      
      doc.font('Helvetica');
      Object.entries(modifications).forEach(([key, value]) => {
        doc.text(`[${key}]`, { continued: true })
           .font('Helvetica-Bold')
           .text(` ${key}: `, { continued: true })
           .font('Helvetica')
           .text(String(value))
           .moveDown(0.3);
      });
    }
    
    // Add content if provided
    if (content) {
      doc.moveDown(1)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('Additional Content:', { underline: true })
         .moveDown(0.5)
         .font('Helvetica')
         .text(content, { align: 'justify' });
    }
    
    // Add data if provided
    if (data && typeof data === 'object') {
      doc.moveDown(1)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('Data:', { underline: true })
         .moveDown(0.5)
         .font('Helvetica');
      
      Object.entries(data).forEach(([key, value]) => {
        doc.text(`${key}: ${String(value)}`)
           .moveDown(0.2);
      });
    }
    
    doc.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
      message: `PDF edited successfully and saved to ${outputPath}`,
      note: "This creates a new PDF with modifications. For actual PDF editing, a specialized library would be needed."
    };
  }

  /**
   * Add watermark to PDF (placeholder)
   * @param {Object} inputs - Contains filePath, watermarkText
   * @returns {Promise<Object>} Result with updated file path
   */
  static async addWatermark(inputs) {
    const { filePath, watermarkText } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    // This is a placeholder implementation
    // In a real implementation, we would overlay the watermark on existing PDF
    return {
      type: 'file',
      path: filePath,
      url: `/skill-outputs/${path.basename(filePath)}`,
      message: `Watermark '${watermarkText || ''}' added (placeholder implementation) to ${filePath}`,
      note: "This is a placeholder - real implementation would overlay watermark using pdf-lib or similar"
    };
  }

  /**
   * Add page numbers to PDF (placeholder)
   * @param {Object} inputs - Contains filePath, position
   * @returns {Promise<Object>} Result with updated file path
   */
  static async addPageNumbers(inputs) {
    const { filePath, position = 'bottom-center' } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    return {
      type: 'file',
      path: filePath,
      url: `/skill-outputs/${path.basename(filePath)}`,
      message: `Page numbers added at ${position} (placeholder implementation) to ${filePath}`,
      note: "This is a placeholder - real implementation would add page numbers using pdf-lib or similar"
    };
  }

  /**
   * Add bookmarks to PDF (placeholder)
   * @param {Object} inputs - Contains filePath, bookmarks
   * @returns {Promise<Object>} Result with updated file path
   */
  static async addBookmarks(inputs) {
    const { filePath, bookmarks } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    return {
      type: 'file',
      path: filePath,
      url: `/skill-outputs/${path.basename(filePath)}`,
      message: `Bookmarks added (placeholder implementation) to ${filePath}`,
      bookmarksCount: bookmarks ? bookmarks.length : 0,
      note: "This is a placeholder - real implementation would add bookmarks using pdf-lib or similar"
    };
  }
}

module.exports = { PdfExecutor };
