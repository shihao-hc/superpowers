/**
 * Multimodal Result Presenter
 * Handles different output formats and presents results appropriately
 */

class MultimodalPresenter {
  constructor(options = {}) {
    this.formats = new Map();
    this.defaultFormat = options.defaultFormat || 'auto';
    this.maxContentSize = options.maxContentSize || 1024 * 1024; // 1MB
    this.enableCompression = options.enableCompression !== false;
    this.enableCaching = options.enableCaching !== false;
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    
    this._registerDefaultFormats();
  }

  /**
   * Register default presentation formats
   */
  _registerDefaultFormats() {
    this.registerFormat('text', {
      name: 'Text',
      mimeTypes: ['text/plain', 'text/markdown'],
      renderer: this._renderText.bind(this),
      supports: ['text', 'markdown', 'code', 'log']
    });

    this.registerFormat('html', {
      name: 'HTML',
      mimeTypes: ['text/html'],
      renderer: this._renderHTML.bind(this),
      supports: ['html', 'rich-text', 'styled-content']
    });

    this.registerFormat('json', {
      name: 'JSON',
      mimeTypes: ['application/json'],
      renderer: this._renderJSON.bind(this),
      supports: ['json', 'structured-data', 'api-response']
    });

    this.registerFormat('image', {
      name: 'Image',
      mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'],
      renderer: this._renderImage.bind(this),
      supports: ['image', 'chart', 'diagram', 'screenshot']
    });

    this.registerFormat('pdf', {
      name: 'PDF',
      mimeTypes: ['application/pdf'],
      renderer: this._renderPDF.bind(this),
      supports: ['pdf', 'document', 'report']
    });

    this.registerFormat('excel', {
      name: 'Excel',
      mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      renderer: this._renderExcel.bind(this),
      supports: ['spreadsheet', 'table', 'data-analysis']
    });

    this.registerFormat('ppt', {
      name: 'PowerPoint',
      mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      renderer: this._renderPPT.bind(this),
      supports: ['presentation', 'slides', 'demo']
    });

    this.registerFormat('video', {
      name: 'Video',
      mimeTypes: ['video/mp4', 'video/webm'],
      renderer: this._renderVideo.bind(this),
      supports: ['video', 'animation', 'recording']
    });

    this.registerFormat('audio', {
      name: 'Audio',
      mimeTypes: ['audio/mp3', 'audio/wav', 'audio/ogg'],
      renderer: this._renderAudio.bind(this),
      supports: ['audio', 'speech', 'sound']
    });

    this.registerFormat('file', {
      name: 'File',
      mimeTypes: ['application/octet-stream'],
      renderer: this._renderFile.bind(this),
      supports: ['file', 'binary', 'archive']
    });
  }

  /**
   * Register a new format
   */
  registerFormat(name, format) {
    this.formats.set(name, {
      name: format.name || name,
      mimeTypes: format.mimeTypes || ['application/octet-stream'],
      renderer: format.renderer || this._renderDefault.bind(this),
      supports: format.supports || [],
      priority: format.priority || 0
    });
  }

  /**
   * Present result in appropriate format
   */
  async present(result, options = {}) {
    const presentationId = `pres_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      // Determine format
      const format = this._determineFormat(result, options);
      
      // Check cache if enabled
      if (this.enableCaching) {
        const cacheKey = this._generateCacheKey(result, format, options);
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          return {
            ...cached.data,
            fromCache: true,
            presentationId
          };
        }
      }

      // Render result
      const rendered = await format.renderer(result, options);
      
      // Validate size
      if (this._getContentSize(rendered) > this.maxContentSize) {
        throw new Error(`Content size exceeds limit of ${this.maxContentSize} bytes`);
      }

      const presentation = {
        presentationId,
        format: format.name,
        mimeType: format.mimeTypes[0],
        content: rendered.content || rendered,
        metadata: {
          ...rendered.metadata,
          originalFormat: result.format || 'unknown',
          renderedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          size: this._getContentSize(rendered)
        },
        attachments: rendered.attachments || [],
        actions: rendered.actions || []
      };

      // Cache result if enabled
      if (this.enableCaching) {
        const cacheKey = this._generateCacheKey(result, format, options);
        this.cache.set(cacheKey, {
          data: presentation,
          timestamp: Date.now()
        });
      }

      return presentation;
    } catch (error) {
      return {
        presentationId,
        format: 'text',
        mimeType: 'text/plain',
        content: `Presentation error: ${error.message}`,
        error: error.message,
        metadata: {
          renderedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          isError: true
        }
      };
    }
  }

  /**
   * Determine the best format for the result
   */
  _determineFormat(result, options) {
    // If format is specified, use it
    if (options.format && this.formats.has(options.format)) {
      return this.formats.get(options.format);
    }

    // Auto-detect based on result type
    if (result.format && this.formats.has(result.format)) {
      return this.formats.get(result.format);
    }

    // Auto-detect based on content type
    const contentType = result.contentType || result.type || '';
    for (const [name, format] of this.formats) {
      if (format.supports.some(support => 
        contentType.includes(support) || 
        (result.content && typeof result.content === 'string' && result.content.includes(support))
      )) {
        return format;
      }
    }

    // Auto-detect based on mime type
    if (result.mimeType) {
      for (const [name, format] of this.formats) {
        if (format.mimeTypes.includes(result.mimeType)) {
          return format;
        }
      }
    }

    // Default to text format
    return this.formats.get(this.defaultFormat) || this.formats.get('text');
  }

  /**
   * Generate cache key
   */
  _generateCacheKey(result, format, options) {
    const keyData = {
      resultId: result.id || result.executionId || 'unknown',
      format: format.name,
      options: JSON.stringify(options)
    };
    return `cache_${JSON.stringify(keyData).hashCode()}`;
  }

  /**
   * Get content size
   */
  _getContentSize(content) {
    if (typeof content === 'string') {
      return new Blob([content]).size;
    }
    return JSON.stringify(content).length;
  }

  /**
   * Text renderer
   */
  async _renderText(result, options) {
    let content = '';
    
    if (result.text) {
      content = result.text;
    } else if (result.message) {
      content = result.message;
    } else if (result.output) {
      content = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
    } else if (result.data) {
      content = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
    } else {
      content = JSON.stringify(result, null, 2);
    }

    // Apply markdown if requested
    if (options.enableMarkdown && this._isMarkdown(content)) {
      return {
        content,
        metadata: {
          isMarkdown: true,
          wordCount: content.split(/\s+/).length
        }
      };
    }

    return {
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        lineCount: content.split('\n').length
      }
    };
  }

  /**
   * HTML renderer
   */
  async _renderHTML(result, options) {
    const textResult = await this._renderText(result, options);
    
    let html = '';
    if (result.html) {
      html = result.html;
    } else {
      // Convert text to HTML
      const escaped = textResult.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      html = `<div class="skill-result">
        <pre>${escaped}</pre>
      </div>`;
    }

    // Add styles if requested
    if (options.enableStyles) {
      html = `<style>
        .skill-result {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 16px;
          background: #f5f5f5;
          border-radius: 8px;
          margin: 8px 0;
        }
        .skill-result pre {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      </style>${html}`;
    }

    return {
      content: html,
      metadata: {
        isHTML: true,
        hasStyles: options.enableStyles
      }
    };
  }

  /**
   * JSON renderer
   */
  async _renderJSON(result, options) {
    const indent = options.indent || 2;
    let content;
    
    try {
      content = JSON.stringify(result, null, indent);
    } catch (error) {
      content = JSON.stringify({ error: error.message, original: result }, null, indent);
    }

    return {
      content,
      metadata: {
        isJSON: true,
        size: content.length,
        keyCount: Object.keys(result).length
      }
    };
  }

  /**
   * Image renderer
   */
  async _renderImage(result, options) {
    if (result.imageUrl) {
      return {
        content: `<img src="${result.imageUrl}" alt="${result.alt || 'Result image'}" />`,
        metadata: {
          isImage: true,
          url: result.imageUrl,
          alt: result.alt
        },
        attachments: [{
          type: 'image',
          url: result.imageUrl,
          mimeType: result.mimeType || 'image/png'
        }]
      };
    }

    if (result.base64) {
      const mimeType = result.mimeType || 'image/png';
      return {
        content: `<img src="data:${mimeType};base64,${result.base64}" alt="${result.alt || 'Result image'}" />`,
        metadata: {
          isImage: true,
          isBase64: true,
          mimeType,
          size: result.base64.length
        },
        attachments: [{
          type: 'image',
          data: result.base64,
          mimeType
        }]
      };
    }

    if (result.buffer) {
      const base64 = result.buffer.toString('base64');
      const mimeType = result.mimeType || 'image/png';
      return {
        content: `<img src="data:${mimeType};base64,${base64}" alt="${result.alt || 'Result image'}" />`,
        metadata: {
          isImage: true,
          isBuffer: true,
          mimeType,
          size: result.buffer.length
        },
        attachments: [{
          type: 'image',
          data: base64,
          mimeType
        }]
      };
    }

    // Fallback to text representation
    return this._renderText(result, options);
  }

  /**
   * PDF renderer
   */
  async _renderPDF(result, options) {
    if (result.pdfUrl) {
      return {
        content: `<iframe src="${result.pdfUrl}" width="100%" height="600px"></iframe>`,
        metadata: {
          isPDF: true,
          url: result.pdfUrl
        },
        attachments: [{
          type: 'pdf',
          url: result.pdfUrl,
          mimeType: 'application/pdf'
        }],
        actions: [{
          type: 'download',
          label: 'Download PDF',
          url: result.pdfUrl
        }]
      };
    }

    if (result.buffer) {
      const base64 = result.buffer.toString('base64');
      return {
        content: `<iframe src="data:application/pdf;base64,${base64}" width="100%" height="600px"></iframe>`,
        metadata: {
          isPDF: true,
          isBase64: true,
          size: result.buffer.length
        },
        attachments: [{
          type: 'pdf',
          data: base64,
          mimeType: 'application/pdf'
        }]
      };
    }

    return this._renderText(result, options);
  }

  /**
   * Excel renderer
   */
  async _renderExcel(result, options) {
    if (result.excelUrl) {
      return {
        content: `<a href="${result.excelUrl}" target="_blank">Download Excel File</a>`,
        metadata: {
          isExcel: true,
          url: result.excelUrl
        },
        attachments: [{
          type: 'excel',
          url: result.excelUrl,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }],
        actions: [{
          type: 'download',
          label: 'Download Excel',
          url: result.excelUrl
        }]
      };
    }

    if (result.buffer) {
      const base64 = result.buffer.toString('base64');
      return {
        content: `<a href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}" 
                   download="${result.filename || 'spreadsheet.xlsx'}">Download Excel File</a>`,
        metadata: {
          isExcel: true,
          isBase64: true,
          size: result.buffer.length
        }
      };
    }

    return this._renderText(result, options);
  }

  /**
   * PowerPoint renderer
   */
  async _renderPPT(result, options) {
    if (result.pptUrl) {
      return {
        content: `<a href="${result.pptUrl}" target="_blank">Download PowerPoint</a>`,
        metadata: {
          isPPT: true,
          url: result.pptUrl
        },
        attachments: [{
          type: 'ppt',
          url: result.pptUrl,
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        }]
      };
    }

    if (result.buffer) {
      const base64 = result.buffer.toString('base64');
      return {
        content: `<a href="data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}" 
                   download="${result.filename || 'presentation.pptx'}">Download PowerPoint</a>`,
        metadata: {
          isPPT: true,
          isBase64: true,
          size: result.buffer.length
        }
      };
    }

    return this._renderText(result, options);
  }

  /**
   * Video renderer
   */
  async _renderVideo(result, options) {
    if (result.videoUrl) {
      return {
        content: `<video controls width="640" height="360">
          <source src="${result.videoUrl}" type="${result.mimeType || 'video/mp4'}">
          Your browser does not support the video tag.
        </video>`,
        metadata: {
          isVideo: true,
          url: result.videoUrl,
          duration: result.duration
        },
        attachments: [{
          type: 'video',
          url: result.videoUrl,
          mimeType: result.mimeType || 'video/mp4'
        }]
      };
    }

    return this._renderText(result, options);
  }

  /**
   * Audio renderer
   */
  async _renderAudio(result, options) {
    if (result.audioUrl) {
      return {
        content: `<audio controls>
          <source src="${result.audioUrl}" type="${result.mimeType || 'audio/mp3'}">
          Your browser does not support the audio element.
        </audio>`,
        metadata: {
          isAudio: true,
          url: result.audioUrl,
          duration: result.duration
        },
        attachments: [{
          type: 'audio',
          url: result.audioUrl,
          mimeType: result.mimeType || 'audio/mp3'
        }]
      };
    }

    return this._renderText(result, options);
  }

  /**
   * File renderer
   */
  async _renderFile(result, options) {
    if (result.fileUrl) {
      return {
        content: `<a href="${result.fileUrl}" target="_blank" download="${result.filename || 'file'}">
          Download File (${result.filename || 'unknown'})
        </a>`,
        metadata: {
          isFile: true,
          url: result.fileUrl,
          filename: result.filename,
          size: result.size
        },
        attachments: [{
          type: 'file',
          url: result.fileUrl,
          filename: result.filename,
          mimeType: result.mimeType || 'application/octet-stream'
        }]
      };
    }

    if (result.buffer) {
      const base64 = result.buffer.toString('base64');
      return {
        content: `<a href="data:${result.mimeType || 'application/octet-stream'};base64,${base64}" 
                   download="${result.filename || 'file'}">
          Download File (${result.filename || 'unknown'})
        </a>`,
        metadata: {
          isFile: true,
          isBase64: true,
          size: result.buffer.length
        }
      };
    }

    return this._renderText(result, options);
  }

  /**
   * Default renderer
   */
  async _renderDefault(result, options) {
    return this._renderText(result, options);
  }

  /**
   * Check if text is markdown
   */
  _isMarkdown(text) {
    const markdownPatterns = [
      /^#{1,6}\s/m, // Headers
      /^\s*[-*+]\s/m, // Lists
      /^\s*\d+\.\s/m, // Numbered lists
      /\[.*?\]\(.*?\)/, // Links
      /\*\*.*?\*\*/, // Bold
      /_.*?_/ // Italic
    ];

    return markdownPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()).length
    };
  }
}

module.exports = { MultimodalPresenter };