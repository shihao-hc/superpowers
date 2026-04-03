/**
 * Skill-specific node definitions with rich inputs/outputs
 * This file defines detailed input/output specifications for specific skills
 */

class SkillNodeDefinitions {
  /**
   * Get detailed node definition for a skill
   * @param {string} skillName - Name of the skill
   * @returns {Object|null} Node definition or null if not found
   */
  static getNodeDefinition(skillName) {
    const definitions = {
      'docx': this.getDocxNodeDefinition(),
      'pdf': this.getPdfNodeDefinition(),
      'canvas-design': this.getCanvasNodeDefinition(),
      'brand-guidelines': this.getBrandGuidelinesNodeDefinition(),
      'pptx': this.getPptxNodeDefinition(),
      'xlsx': this.getXlsxNodeDefinition(),
      'claude-api': this.getClaudeApiNodeDefinition(),
      'mcp-builder': this.getMcpBuilderNodeDefinition(),
      'skill-creator': this.getSkillCreatorNodeDefinition(),
      'frontend-design': this.getFrontendDesignNodeDefinition(),
      'doc-coauthoring': this.getDocCoauthoringNodeDefinition(),
      'theme-factory': this.getThemeFactoryNodeDefinition(),
      'slack-gif-creator': this.getSlackGifCreatorNodeDefinition(),
      'web-artifacts-builder': this.getWebArtifactsBuilderNodeDefinition(),
      'webapp-testing': this.getWebappTestingNodeDefinition(),
      'internal-comms': this.getInternalCommsNodeDefinition(),
      'algorithmic-art': this.getAlgorithmicArtNodeDefinition()
    };
    
    return definitions[skillName] || null;
  }

  /**
   * Get all supported skill node definitions
   * @returns {Object} Map of skill names to node definitions
   */
  static getAllNodeDefinitions() {
    return {
      'docx': this.getDocxNodeDefinition(),
      'pdf': this.getPdfNodeDefinition(),
      'canvas-design': this.getCanvasNodeDefinition(),
      'brand-guidelines': this.getBrandGuidelinesNodeDefinition(),
      'pptx': this.getPptxNodeDefinition(),
      'xlsx': this.getXlsxNodeDefinition(),
      'claude-api': this.getClaudeApiNodeDefinition(),
      'mcp-builder': this.getMcpBuilderNodeDefinition(),
      'skill-creator': this.getSkillCreatorNodeDefinition(),
      'frontend-design': this.getFrontendDesignNodeDefinition(),
      'doc-coauthoring': this.getDocCoauthoringNodeDefinition(),
      'theme-factory': this.getThemeFactoryNodeDefinition(),
      'slack-gif-creator': this.getSlackGifCreatorNodeDefinition(),
      'web-artifacts-builder': this.getWebArtifactsBuilderNodeDefinition(),
      'webapp-testing': this.getWebappTestingNodeDefinition(),
      'internal-comms': this.getInternalCommsNodeDefinition(),
      'algorithmic-art': this.getAlgorithmicArtNodeDefinition()
    };
  }

  /**
   * DOCX skill node definition
   */
  static getDocxNodeDefinition() {
    return {
      category: 'Document Processing',
      description: 'Create, read, edit, and manipulate Word documents (.docx files)',
      riskLevel: 'low',
      pure: false,
      actions: [
        {
          name: 'create',
          label: 'Create Document',
          description: 'Create a new Word document',
          inputs: {
            title: { type: 'string', required: false, description: 'Document title' },
            content: { type: 'string|array', required: false, description: 'Document content (string or array of paragraphs)' },
            data: { type: 'object', required: false, description: 'Key-value pairs to include in document' },
            author: { type: 'string', required: false, description: 'Document author' },
            subject: { type: 'string', required: false, description: 'Document subject' },
            filePath: { type: 'string', required: false, description: 'Output file path (optional)' },
            pageSize: { type: 'string', required: false, description: 'Page size (A4, Letter, etc.)', default: 'Letter' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated document file' },
            path: { type: 'string', description: 'Path to the generated file' },
            url: { type: 'string', description: 'URL to access the file' },
            size: { type: 'number', description: 'File size in bytes' }
          }
        },
        {
          name: 'createWithHeadings',
          label: 'Create Document with Headings',
          description: 'Create a document with structured headings',
          inputs: {
            title: { type: 'string', required: true, description: 'Document title' },
            headings: { type: 'array', required: true, description: 'Array of heading objects with level, text, and content' },
            author: { type: 'string', required: false, description: 'Document author' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated document file' },
            headingsCount: { type: 'number', description: 'Number of headings in document' }
          }
        },
        {
          name: 'createWithTable',
          label: 'Create Document with Table',
          description: 'Create a document containing tables',
          inputs: {
            title: { type: 'string', required: false, description: 'Document title' },
            headers: { type: 'array', required: true, description: 'Table column headers' },
            tableData: { type: 'array', required: true, description: '2D array of table data' },
            author: { type: 'string', required: false, description: 'Document author' },
            tableWidth: { type: 'number', required: false, description: 'Table width in points', default: 9000 },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated document file' },
            tableRows: { type: 'number', description: 'Number of table rows' },
            tableColumns: { type: 'number', description: 'Number of table columns' }
          }
        },
        {
          name: 'createWithImage',
          label: 'Create Document with Images',
          description: 'Create a document with embedded images',
          inputs: {
            title: { type: 'string', required: false, description: 'Document title' },
            content: { type: 'string', required: false, description: 'Document content' },
            images: { type: 'array', required: true, description: 'Array of image objects with path, caption, width, height' },
            author: { type: 'string', required: false, description: 'Document author' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated document file' },
            imagesCount: { type: 'number', description: 'Number of images embedded' }
          }
        },
        {
          name: 'createReport',
          label: 'Create Professional Report',
          description: 'Create a professional report with sections, TOC, headers/footers',
          inputs: {
            title: { type: 'string', required: true, description: 'Report title' },
            sections: { type: 'array', required: true, description: 'Array of section objects with title, content, subsections' },
            author: { type: 'string', required: false, description: 'Report author' },
            date: { type: 'string', required: false, description: 'Report date' },
            abstract: { type: 'string', required: false, description: 'Report abstract' },
            conclusion: { type: 'string', required: false, description: 'Report conclusion' },
            includeToc: { type: 'boolean', required: false, description: 'Include table of contents', default: false },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated report file' },
            sectionsCount: { type: 'number', description: 'Number of sections' }
          }
        },
        {
          name: 'read',
          label: 'Read Document',
          description: 'Extract content from a Word document',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the document file' }
          },
          outputs: {
            content: { type: 'string', description: 'Extracted text content' },
            metadata: { type: 'object', description: 'Document metadata' }
          }
        },
        {
          name: 'edit',
          label: 'Edit Document',
          description: 'Edit an existing Word document',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the document file' },
            modifications: { type: 'object', required: true, description: 'Modifications to apply' },
            data: { type: 'object', required: false, description: 'Additional data to add' },
            content: { type: 'string', required: false, description: 'Additional content to add' }
          },
          outputs: {
            file: { type: 'file', description: 'Edited document file' },
            path: { type: 'string', description: 'Path to the edited file' }
          }
        }
      ]
    };
  }

  /**
   * PDF skill node definition
   */
  static getPdfNodeDefinition() {
    return {
      category: 'Document Processing',
      description: 'Create, read, edit, and manipulate PDF documents',
      riskLevel: 'low',
      pure: false,
      actions: [
        {
          name: 'create',
          label: 'Create PDF',
          description: 'Create a new PDF document',
          inputs: {
            title: { type: 'string', required: false, description: 'PDF title' },
            content: { type: 'string|array', required: false, description: 'PDF content' },
            data: { type: 'object', required: false, description: 'Key-value pairs to include' },
            author: { type: 'string', required: false, description: 'PDF author' },
            width: { type: 'number', required: false, description: 'Page width in points', default: 595.28 },
            height: { type: 'number', required: false, description: 'Page height in points', default: 841.89 },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated PDF file' },
            path: { type: 'string', description: 'Path to the generated file' },
            url: { type: 'string', description: 'URL to access the file' },
            size: { type: 'number', description: 'File size in bytes' }
          }
        },
        {
          name: 'createWithForm',
          label: 'Create PDF Form',
          description: 'Create a PDF with form fields',
          inputs: {
            title: { type: 'string', required: false, description: 'Form title' },
            formFields: { type: 'array', required: true, description: 'Array of form field definitions' },
            data: { type: 'object', required: false, description: 'Form data to pre-fill' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated PDF form' },
            formFieldsCount: { type: 'number', description: 'Number of form fields' }
          }
        },
        {
          name: 'createWithTable',
          label: 'Create PDF with Table',
          description: 'Create a PDF containing tables',
          inputs: {
            title: { type: 'string', required: false, description: 'Document title' },
            headers: { type: 'array', required: true, description: 'Table column headers' },
            tableData: { type: 'array', required: true, description: '2D array of table data' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated PDF file' },
            tableRows: { type: 'number', description: 'Number of table rows' },
            tableColumns: { type: 'number', description: 'Number of table columns' }
          }
        },
        {
          name: 'createReport',
          label: 'Create PDF Report',
          description: 'Create a professional PDF report',
          inputs: {
            title: { type: 'string', required: true, description: 'Report title' },
            sections: { type: 'array', required: true, description: 'Array of section objects' },
            author: { type: 'string', required: false, description: 'Report author' },
            date: { type: 'string', required: false, description: 'Report date' },
            abstract: { type: 'string', required: false, description: 'Report abstract' },
            conclusion: { type: 'string', required: false, description: 'Report conclusion' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated report file' },
            sectionsCount: { type: 'number', description: 'Number of sections' }
          }
        },
        {
          name: 'createInvoice',
          label: 'Create PDF Invoice',
          description: 'Create a professional invoice',
          inputs: {
            invoiceNumber: { type: 'string', required: true, description: 'Invoice number' },
            date: { type: 'string', required: true, description: 'Invoice date' },
            dueDate: { type: 'string', required: false, description: 'Payment due date' },
            from: { type: 'object|string', required: true, description: 'Sender information' },
            to: { type: 'object|string', required: true, description: 'Recipient information' },
            items: { type: 'array', required: true, description: 'Invoice line items' },
            tax: { type: 'number|object', required: false, description: 'Tax rate or amount' },
            discount: { type: 'number|object', required: false, description: 'Discount rate or amount' },
            notes: { type: 'string', required: false, description: 'Invoice notes' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated invoice file' },
            invoiceNumber: { type: 'string', description: 'Invoice number' },
            itemsCount: { type: 'number', description: 'Number of line items' }
          }
        },
        {
          name: 'read',
          label: 'Read PDF',
          description: 'Extract content from a PDF document',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the PDF file' }
          },
          outputs: {
            content: { type: 'string', description: 'Extracted text content' },
            metadata: { type: 'object', description: 'PDF metadata' }
          }
        },
        {
          name: 'edit',
          label: 'Edit PDF',
          description: 'Edit an existing PDF document',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the PDF file' },
            modifications: { type: 'object', required: true, description: 'Modifications to apply' },
            data: { type: 'object', required: false, description: 'Additional data' },
            content: { type: 'string', required: false, description: 'Additional content' }
          },
          outputs: {
            file: { type: 'file', description: 'Edited PDF file' },
            path: { type: 'string', description: 'Path to the edited file' }
          }
        }
      ]
    };
  }

  /**
   * Canvas Design skill node definition
   */
  static getCanvasNodeDefinition() {
    return {
      category: 'Graphics & Design',
      description: 'Create and manipulate canvas designs, images, charts, and icons',
      riskLevel: 'low',
      pure: false,
      actions: [
        {
          name: 'create',
          label: 'Create Canvas',
          description: 'Create a new canvas design',
          inputs: {
            width: { type: 'number', required: false, description: 'Canvas width in pixels', default: 800 },
            height: { type: 'number', required: false, description: 'Canvas height in pixels', default: 600 },
            backgroundColor: { type: 'string', required: false, description: 'Background color or gradient', default: '#ffffff' },
            title: { type: 'string', required: false, description: 'Canvas title' },
            format: { type: 'string', required: false, description: 'Output format (png, jpeg, webp)', default: 'png' },
            quality: { type: 'number', required: false, description: 'Image quality (0-1)', default: 0.92 },
            elements: { type: 'array', required: false, description: 'Array of design elements' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            image: { type: 'image', description: 'Generated image file' },
            path: { type: 'string', description: 'Path to the image file' },
            url: { type: 'string', description: 'URL to access the image' },
            width: { type: 'number', description: 'Image width' },
            height: { type: 'number', description: 'Image height' },
            size: { type: 'number', description: 'File size in bytes' }
          }
        },
        {
          name: 'createChart',
          label: 'Create Chart',
          description: 'Create a chart (bar, line, pie, doughnut)',
          inputs: {
            chartType: { type: 'string', required: true, description: 'Chart type (bar, line, pie, doughnut)', enum: ['bar', 'line', 'pie', 'doughnut'] },
            data: { type: 'array', required: true, description: 'Chart data values' },
            labels: { type: 'array', required: true, description: 'Data labels' },
            colors: { type: 'array', required: false, description: 'Chart colors' },
            title: { type: 'string', required: false, description: 'Chart title', default: 'Chart' },
            width: { type: 'number', required: false, description: 'Chart width', default: 800 },
            height: { type: 'number', required: false, description: 'Chart height', default: 600 },
            showLegend: { type: 'boolean', required: false, description: 'Show legend', default: true },
            showValues: { type: 'boolean', required: false, description: 'Show data values', default: true },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            image: { type: 'image', description: 'Generated chart image' },
            chartType: { type: 'string', description: 'Chart type' },
            dataPoints: { type: 'number', description: 'Number of data points' }
          }
        },
        {
          name: 'createIcon',
          label: 'Create Icon',
          description: 'Create a custom icon',
          inputs: {
            iconType: { type: 'string', required: true, description: 'Icon type', enum: ['check', 'cross', 'arrow-right', 'star', 'heart', 'user', 'settings', 'default'] },
            size: { type: 'number', required: false, description: 'Icon size in pixels', default: 64 },
            color: { type: 'string', required: false, description: 'Icon color', default: '#4CAF50' },
            backgroundColor: { type: 'string', required: false, description: 'Background color', default: 'transparent' },
            strokeWidth: { type: 'number', required: false, description: 'Stroke width', default: 2 },
            fill: { type: 'boolean', required: false, description: 'Fill icon', default: false },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            image: { type: 'image', description: 'Generated icon image' },
            iconType: { type: 'string', description: 'Icon type' },
            size: { type: 'number', description: 'Icon size' }
          }
        },
        {
          name: 'createBanner',
          label: 'Create Banner',
          description: 'Create a banner with text and styling',
          inputs: {
            text: { type: 'string', required: true, description: 'Banner text' },
            width: { type: 'number', required: false, description: 'Banner width', default: 800 },
            height: { type: 'number', required: false, description: 'Banner height', default: 200 },
            backgroundColor: { type: 'string', required: false, description: 'Background color', default: '#2196F3' },
            textColor: { type: 'string', required: false, description: 'Text color', default: '#ffffff' },
            fontSize: { type: 'number', required: false, description: 'Font size', default: 48 },
            fontFamily: { type: 'string', required: false, description: 'Font family', default: 'Arial' },
            gradientColors: { type: 'array', required: false, description: 'Gradient colors' },
            pattern: { type: 'string', required: false, description: 'Background pattern', enum: ['none', 'stripes', 'dots', 'grid'], default: 'none' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            image: { type: 'image', description: 'Generated banner image' },
            width: { type: 'number', description: 'Banner width' },
            height: { type: 'number', description: 'Banner height' },
            text: { type: 'string', description: 'Banner text' }
          }
        },
        {
          name: 'edit',
          label: 'Edit Canvas',
          description: 'Edit an existing canvas design',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the image file' },
            elements: { type: 'array', required: true, description: 'Elements to add/modify' },
            backgroundColor: { type: 'string', required: false, description: 'New background color' }
          },
          outputs: {
            image: { type: 'image', description: 'Edited image file' },
            width: { type: 'number', description: 'Image width' },
            height: { type: 'number', description: 'Image height' },
            elementsAdded: { type: 'number', description: 'Number of elements added' }
          }
        },
        {
          name: 'applyFilter',
          label: 'Apply Filter',
          description: 'Apply image filter to canvas',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the image file' },
            filter: { type: 'string', required: true, description: 'Filter type', enum: ['grayscale', 'sepia', 'invert', 'brightness', 'contrast'] },
            intensity: { type: 'number', required: false, description: 'Filter intensity (0-1)', default: 1.0 }
          },
          outputs: {
            image: { type: 'image', description: 'Filtered image file' },
            filterApplied: { type: 'string', description: 'Applied filter' },
            intensity: { type: 'number', description: 'Filter intensity' }
          }
        },
        {
          name: 'resize',
          label: 'Resize Canvas',
          description: 'Resize an existing canvas',
          inputs: {
            filePath: { type: 'string', required: true, description: 'Path to the image file' },
            width: { type: 'number', required: true, description: 'New width in pixels' },
            height: { type: 'number', required: true, description: 'New height in pixels' },
            maintainAspectRatio: { type: 'boolean', required: false, description: 'Maintain aspect ratio', default: true }
          },
          outputs: {
            image: { type: 'image', description: 'Resized image file' },
            width: { type: 'number', description: 'New width' },
            height: { type: 'number', description: 'New height' },
            originalWidth: { type: 'number', description: 'Original width' },
            originalHeight: { type: 'number', description: 'Original height' }
          }
        }
      ]
    };
  }

  /**
   * Brand Guidelines skill node definition
   */
  static getBrandGuidelinesNodeDefinition() {
    return {
      category: 'Design System',
      description: 'Apply Anthropic official brand guidelines and design system',
      actions: [
        {
          name: 'apply',
          label: 'Apply Brand Guidelines',
          description: 'Apply brand guidelines to a design',
          inputs: {
            elements: { type: 'array', required: true, description: 'Design elements to apply brand guidelines to' },
            brand: { type: 'string', required: false, description: 'Brand to apply', default: 'anthropic' }
          },
          outputs: {
            styledElements: { type: 'array', description: 'Elements with brand guidelines applied' }
          }
        }
      ]
    };
  }

  /**
   * PowerPoint skill node definition
   */
  static getPptxNodeDefinition() {
    return {
      category: 'Document Processing',
      description: 'Create and manipulate PowerPoint presentations',
      actions: [
        {
          name: 'create',
          label: 'Create Presentation',
          description: 'Create a new PowerPoint presentation',
          inputs: {
            title: { type: 'string', required: true, description: 'Presentation title' },
            slides: { type: 'array', required: true, description: 'Array of slide objects' },
            author: { type: 'string', required: false, description: 'Presentation author' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated presentation file' },
            slidesCount: { type: 'number', description: 'Number of slides' }
          }
        }
      ]
    };
  }

  /**
   * Excel skill node definition
   */
  static getXlsxNodeDefinition() {
    return {
      category: 'Document Processing',
      description: 'Create and manipulate Excel spreadsheets',
      actions: [
        {
          name: 'create',
          label: 'Create Spreadsheet',
          description: 'Create a new Excel spreadsheet',
          inputs: {
            title: { type: 'string', required: false, description: 'Spreadsheet title' },
            sheets: { type: 'array', required: true, description: 'Array of sheet data' },
            author: { type: 'string', required: false, description: 'Spreadsheet author' },
            filePath: { type: 'string', required: false, description: 'Output file path' }
          },
          outputs: {
            file: { type: 'file', description: 'Generated spreadsheet file' },
            sheetsCount: { type: 'number', description: 'Number of sheets' }
          }
        }
      ]
    };
  }

  /**
   * Claude API skill node definition
   */
  static getClaudeApiNodeDefinition() {
    return {
      category: 'AI Integration',
      description: 'Interact with Claude API for advanced AI capabilities',
      riskLevel: 'medium',
      pure: false,
      actions: [
        {
          name: 'chat',
          label: 'Chat with Claude',
          description: 'Send a message to Claude and get a response',
          inputs: {
            message: { type: 'string', required: true, description: 'Message to send to Claude' },
            model: { type: 'string', required: false, description: 'Claude model to use', default: 'claude-3-sonnet-20240229' },
            maxTokens: { type: 'number', required: false, description: 'Maximum tokens in response', default: 1024 },
            systemPrompt: { type: 'string', required: false, description: 'System prompt' }
          },
          outputs: {
            response: { type: 'string', description: 'Claude response' },
            usage: { type: 'object', description: 'Token usage information' }
          }
        }
      ]
    };
  }

  /**
   * MCP Builder skill node definition
   */
  static getMcpBuilderNodeDefinition() {
    return {
      category: 'Development Tools',
      description: 'Build MCP (Model Context Protocol) servers and tools',
      riskLevel: 'high',
      pure: false,
      actions: [
        {
          name: 'createServer',
          label: 'Create MCP Server',
          description: 'Create a new MCP server',
          inputs: {
            name: { type: 'string', required: true, description: 'Server name' },
            tools: { type: 'array', required: true, description: 'Array of tool definitions' },
            description: { type: 'string', required: false, description: 'Server description' }
          },
          outputs: {
            server: { type: 'object', description: 'Created MCP server configuration' },
            path: { type: 'string', description: 'Path to server files' }
          }
        }
      ]
    };
  }

  /**
   * Skill Creator skill node definition
   */
  static getSkillCreatorNodeDefinition() {
    return {
      category: 'Development Tools',
      description: 'Create new skills for the UltraWork platform',
      actions: [
        {
          name: 'create',
          label: 'Create Skill',
          description: 'Create a new skill definition',
          inputs: {
            name: { type: 'string', required: true, description: 'Skill name' },
            description: { type: 'string', required: true, description: 'Skill description' },
            category: { type: 'string', required: false, description: 'Skill category' },
            actions: { type: 'array', required: true, description: 'Skill actions' },
            dependencies: { type: 'array', required: false, description: 'Skill dependencies' }
          },
          outputs: {
            skill: { type: 'object', description: 'Created skill definition' },
            path: { type: 'string', description: 'Path to skill files' }
          }
        }
      ]
    };
  }

  /**
   * Frontend Design skill node definition
   */
  static getFrontendDesignNodeDefinition() {
    return {
      category: 'Design System',
      description: 'Create frontend design components and layouts',
      actions: [
        {
          name: 'createComponent',
          label: 'Create UI Component',
          description: 'Create a frontend UI component',
          inputs: {
            type: { type: 'string', required: true, description: 'Component type' },
            props: { type: 'object', required: false, description: 'Component properties' },
            styles: { type: 'object', required: false, description: 'Component styles' }
          },
          outputs: {
            component: { type: 'object', description: 'Created UI component' }
          }
        }
      ]
    };
  }

  /**
   * Document Co-authoring skill node definition
   */
  static getDocCoauthoringNodeDefinition() {
    return {
      category: 'Collaboration',
      description: 'Collaborate on document creation and editing',
      actions: [
        {
          name: 'createCollaborative',
          label: 'Create Collaborative Document',
          description: 'Create a document for collaborative editing',
          inputs: {
            title: { type: 'string', required: true, description: 'Document title' },
            collaborators: { type: 'array', required: false, description: 'List of collaborators' },
            content: { type: 'string', required: false, description: 'Initial content' }
          },
          outputs: {
            document: { type: 'object', description: 'Collaborative document' },
            shareUrl: { type: 'string', description: 'Share URL for collaboration' }
          }
        }
      ]
    };
  }

  /**
   * Theme Factory skill node definition
   */
  static getThemeFactoryNodeDefinition() {
    return {
      category: 'Design System',
      description: 'Create and manage design themes',
      actions: [
        {
          name: 'createTheme',
          label: 'Create Theme',
          description: 'Create a new design theme',
          inputs: {
            name: { type: 'string', required: true, description: 'Theme name' },
            colors: { type: 'object', required: true, description: 'Color palette' },
            fonts: { type: 'object', required: false, description: 'Font definitions' },
            spacing: { type: 'object', required: false, description: 'Spacing system' }
          },
          outputs: {
            theme: { type: 'object', description: 'Created theme configuration' }
          }
        }
      ]
    };
  }

  /**
   * Slack GIF Creator skill node definition
   */
  static getSlackGifCreatorNodeDefinition() {
    return {
      category: 'Media',
      description: 'Create GIF animations for Slack',
      actions: [
        {
          name: 'createGif',
          label: 'Create GIF',
          description: 'Create an animated GIF for Slack',
          inputs: {
            frames: { type: 'array', required: true, description: 'Array of frame images' },
            delay: { type: 'number', required: false, description: 'Frame delay in milliseconds', default: 100 },
            loop: { type: 'boolean', required: false, description: 'Loop animation', default: true }
          },
          outputs: {
            gif: { type: 'file', description: 'Generated GIF file' },
            path: { type: 'string', description: 'Path to GIF file' }
          }
        }
      ]
    };
  }

  /**
   * Web Artifacts Builder skill node definition
   */
  static getWebArtifactsBuilderNodeDefinition() {
    return {
      category: 'Development Tools',
      description: 'Build web artifacts and components',
      actions: [
        {
          name: 'createArtifact',
          label: 'Create Web Artifact',
          description: 'Create a web artifact or component',
          inputs: {
            type: { type: 'string', required: true, description: 'Artifact type' },
            content: { type: 'object', required: true, description: 'Artifact content' },
            styles: { type: 'object', required: false, description: 'Artifact styles' }
          },
          outputs: {
            artifact: { type: 'object', description: 'Created web artifact' },
            html: { type: 'string', description: 'Generated HTML' }
          }
        }
      ]
    };
  }

  /**
   * Web App Testing skill node definition
   */
  static getWebappTestingNodeDefinition() {
    return {
      category: 'Quality Assurance',
      description: 'Test web applications and generate reports',
      actions: [
        {
          name: 'runTests',
          label: 'Run Web App Tests',
          description: 'Run tests on a web application',
          inputs: {
            url: { type: 'string', required: true, description: 'Web app URL' },
            tests: { type: 'array', required: true, description: 'Tests to run' },
            browser: { type: 'string', required: false, description: 'Browser to use', default: 'chrome' }
          },
          outputs: {
            results: { type: 'object', description: 'Test results' },
            report: { type: 'file', description: 'Test report' }
          }
        }
      ]
    };
  }

  /**
   * Internal Communications skill node definition
   */
  static getInternalCommsNodeDefinition() {
    return {
      category: 'Communication',
      description: 'Manage internal communications and messaging',
      actions: [
        {
          name: 'sendMessage',
          label: 'Send Internal Message',
          description: 'Send a message to internal team',
          inputs: {
            to: { type: 'string|array', required: true, description: 'Recipient(s)' },
            subject: { type: 'string', required: true, description: 'Message subject' },
            body: { type: 'string', required: true, description: 'Message body' },
            channel: { type: 'string', required: false, description: 'Communication channel' }
          },
          outputs: {
            sent: { type: 'boolean', description: 'Message sent successfully' },
            messageId: { type: 'string', description: 'Message ID' }
          }
        }
      ]
    };
  }

  /**
   * Algorithmic Art skill node definition
   */
  static getAlgorithmicArtNodeDefinition() {
    return {
      category: 'Graphics & Design',
      description: 'Create algorithmic and generative art',
      actions: [
        {
          name: 'createArt',
          label: 'Create Algorithmic Art',
          description: 'Create algorithmic art piece',
          inputs: {
            algorithm: { type: 'string', required: true, description: 'Art algorithm to use' },
            parameters: { type: 'object', required: false, description: 'Algorithm parameters' },
            width: { type: 'number', required: false, description: 'Canvas width', default: 800 },
            height: { type: 'number', required: false, description: 'Canvas height', default: 800 },
            seed: { type: 'number', required: false, description: 'Random seed for reproducibility' }
          },
          outputs: {
            image: { type: 'image', description: 'Generated art image' },
            algorithm: { type: 'string', description: 'Algorithm used' },
            parameters: { type: 'object', description: 'Parameters used' }
          }
        }
      ]
    };
  }
}

module.exports = { SkillNodeDefinitions };