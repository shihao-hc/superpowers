const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

class CanvasExecutor {
  /**
   * Execute canvas-design skill operations
   * @param {Object} inputs - Input parameters for the operation
   * @returns {Promise<Object>} Result object with image URL or data
   */
  static async execute(inputs) {
    const action = inputs.action || 'create';
    
    try {
      switch (action) {
        case 'create':
          return await this.createCanvas(inputs);
        case 'createWithElements':
          return await this.createCanvasWithElements(inputs);
        case 'createChart':
          return await this.createChart(inputs);
        case 'createIcon':
          return await this.createIcon(inputs);
        case 'createBanner':
          return await this.createBanner(inputs);
        case 'edit':
          return await this.editCanvas(inputs);
        case 'addText':
          return await this.addTextToCanvas(inputs);
        case 'addShape':
          return await this.addShapeToCanvas(inputs);
        case 'applyFilter':
          return await this.applyFilter(inputs);
        case 'resize':
          return await this.resizeCanvas(inputs);
        case 'addGradient':
          return await this.addGradient(inputs);
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      throw new Error(`CanvasExecutor failed: ${error.message}`);
    }
  }

  /**
   * Create a new canvas design
   * @param {Object} inputs - Contains width, height, backgroundColor, elements, etc.
   * @returns {Promise<Object>} Result with image URL
   */
  static async createCanvas(inputs) {
    const { 
      width = 800, 
      height = 600, 
      backgroundColor = '#ffffff',
      elements = [],
      filePath,
      title,
      format = 'png',
      quality = 0.92,
      fontFamily = 'Arial',
      fontSize = 24,
      fontColor = '#000000'
    } = inputs;
    // Persist to uploads/skills for consistency
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set background
    if (backgroundColor.startsWith('gradient:')) {
      // Handle gradient background
      const gradientParts = backgroundColor.split(':');
      if (gradientParts.length >= 3) {
        const direction = gradientParts[1] || 'vertical';
        const colors = gradientParts[2].split(',');
        
        if (direction === 'vertical') {
          const gradient = ctx.createLinearGradient(0, 0, 0, height);
          colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1), color);
          });
          ctx.fillStyle = gradient;
        } else if (direction === 'horizontal') {
          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1), color);
          });
          ctx.fillStyle = gradient;
        } else if (direction === 'radial') {
          const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
          colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1), color);
          });
          ctx.fillStyle = gradient;
        }
      } else {
        ctx.fillStyle = '#ffffff';
      }
    } else {
      ctx.fillStyle = backgroundColor;
    }
    ctx.fillRect(0, 0, width, height);
    
    // Add title if provided
    if (title) {
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = fontColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add shadow for better readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.fillText(title, width / 2, 50);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    
    // Process elements
    for (const element of elements) {
      await this.drawElement(ctx, element);
    }
    
    // Determine output path
    const outputPath = filePath || path.join(uploadsDir, `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${format}`);
    
    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save as specified format
    let buffer;
    if (format === 'jpeg' || format === 'jpg') {
      buffer = canvas.toBuffer('image/jpeg', { quality: quality });
    } else if (format === 'webp') {
      buffer = canvas.toBuffer('image/webp', { quality: quality });
    } else {
      buffer = canvas.toBuffer('image/png');
    }
    
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      format: format,
      size: buffer.length,
      message: `Canvas created successfully at ${outputPath}`
    };
  }

  /**
   * Create a canvas with organized elements
   * @param {Object} inputs - Contains layout, elements, styling
   * @returns {Promise<Object>} Result with image URL
   */
  static async createCanvasWithElements(inputs) {
    const { 
      width = 800, 
      height = 600, 
      backgroundColor = '#ffffff',
      layout = 'grid', // grid, flex, absolute
      columns = 2,
      gap = 20,
      padding = 40,
      elements = [],
      filePath,
      title
    } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Add title if provided
    if (title) {
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 50);
    }
    
    // Calculate element positions based on layout
    const elementWidth = (width - (padding * 2) - (gap * (columns - 1))) / columns;
    const startY = title ? 100 : padding;
    
    elements.forEach((element, index) => {
      let x, y;
      
      if (layout === 'grid') {
        const row = Math.floor(index / columns);
        const col = index % columns;
        x = padding + (col * (elementWidth + gap));
        y = startY + (row * (elementWidth + gap));
      } else if (layout === 'flex') {
        x = padding + (index * ((width - (padding * 2)) / elements.length));
        y = startY;
      } else {
        x = element.x || padding;
        y = element.y || startY;
      }
      
      // Draw element with calculated position
      const elementWithPosition = {
        ...element,
        x: x,
        y: y,
        width: element.width || elementWidth,
        height: element.height || elementWidth
      };
      
      this.drawElement(ctx, elementWithPosition);
    });
    
    const outputPath = filePath || path.join(uploadsDir, `canvas-grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      elementsCount: elements.length,
      layout: layout,
      message: `Canvas with ${layout} layout created successfully at ${outputPath}`
    };
  }

  /**
   * Create a chart (bar, line, pie)
   * @param {Object} inputs - Contains chartType, data, labels, colors, title
   * @returns {Promise<Object>} Result with chart image
   */
  static async createChart(inputs) {
    const { 
      chartType = 'bar', // bar, line, pie, doughnut
      data = [], // Array of numbers
      labels = [], // Array of strings
      colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0'],
      title = 'Chart',
      width = 800,
      height = 600,
      backgroundColor = '#ffffff',
      filePath,
      showLegend = true,
      showValues = true
    } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Add title
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 40);
    
    // Calculate chart area
    const chartArea = {
      x: 80,
      y: 80,
      width: width - 160,
      height: height - 160
    };
    
    if (chartType === 'bar') {
      await this.drawBarChart(ctx, data, labels, colors, chartArea, showValues);
    } else if (chartType === 'line') {
      await this.drawLineChart(ctx, data, labels, colors, chartArea, showValues);
    } else if (chartType === 'pie' || chartType === 'doughnut') {
      await this.drawPieChart(ctx, data, labels, colors, chartArea, chartType === 'doughnut');
    }
    
    // Add legend if requested
    if (showLegend && labels.length > 0) {
      this.drawLegend(ctx, labels, colors, width - 150, 80);
    }
    
    const outputPath = filePath || path.join(uploadsDir, `chart-${chartType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      chartType: chartType,
      dataPoints: data.length,
      message: `${chartType} chart created successfully at ${outputPath}`
    };
  }

  /**
   * Draw a bar chart
   */
  static async drawBarChart(ctx, data, labels, colors, chartArea, showValues) {
    const maxValue = Math.max(...data);
    const barWidth = chartArea.width / data.length - 10;
    
    data.forEach((value, index) => {
      const barHeight = (value / maxValue) * chartArea.height;
      const x = chartArea.x + (index * (barWidth + 10));
      const y = chartArea.y + chartArea.height - barHeight;
      
      // Draw bar
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(x, y, barWidth, barHeight);
      
      // Draw border
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, barWidth, barHeight);
      
      // Draw label
      ctx.fillStyle = '#333333';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(labels[index] || `Item ${index + 1}`, x + barWidth / 2, chartArea.y + chartArea.height + 20);
      
      // Draw value if requested
      if (showValues) {
        ctx.fillText(value.toString(), x + barWidth / 2, y - 5);
      }
    });
  }

  /**
   * Draw a line chart
   */
  static async drawLineChart(ctx, data, labels, colors, chartArea, showValues) {
    const maxValue = Math.max(...data);
    const stepX = chartArea.width / (data.length - 1);
    
    // Draw grid lines
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = chartArea.y + (chartArea.height * i / 5);
      ctx.beginPath();
      ctx.moveTo(chartArea.x, y);
      ctx.lineTo(chartArea.x + chartArea.width, y);
      ctx.stroke();
    }
    
    // Draw line
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((value, index) => {
      const x = chartArea.x + (index * stepX);
      const y = chartArea.y + chartArea.height - (value / maxValue) * chartArea.height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      // Draw point
      ctx.fillStyle = colors[0];
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw label
      ctx.fillStyle = '#333333';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(labels[index] || `Point ${index + 1}`, x, chartArea.y + chartArea.height + 20);
      
      // Draw value if requested
      if (showValues) {
        ctx.fillText(value.toString(), x, y - 10);
      }
    });
    
    ctx.stroke();
  }

  /**
   * Draw a pie/doughnut chart
   */
  static async drawPieChart(ctx, data, labels, colors, chartArea, isDoughnut) {
    const total = data.reduce((sum, value) => sum + value, 0);
    let currentAngle = -Math.PI / 2; // Start from top
    
    const centerX = chartArea.x + chartArea.width / 2;
    const centerY = chartArea.y + chartArea.height / 2;
    const radius = Math.min(chartArea.width, chartArea.height) / 2 - 20;
    
    data.forEach((value, index) => {
      const sliceAngle = (value / total) * Math.PI * 2;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      
      // Add slice border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const percentage = Math.round((value / total) * 100);
      ctx.fillText(`${percentage}%`, labelX, labelY);
      
      currentAngle += sliceAngle;
    });
    
    // Draw inner circle for doughnut
    if (isDoughnut) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      
      // Add center text
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Total', centerX, centerY - 10);
      ctx.font = 'bold 20px Arial';
      ctx.fillText(total.toString(), centerX, centerY + 15);
    }
  }

  /**
   * Draw legend
   */
  static drawLegend(ctx, labels, colors, x, y) {
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    labels.forEach((label, index) => {
      const legendY = y + (index * 25);
      
      // Draw color box
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(x, legendY, 15, 15);
      
      // Draw label text
      ctx.fillStyle = '#333333';
      ctx.fillText(label, x + 20, legendY + 7);
    });
  }

  /**
   * Create an icon
   * @param {Object} inputs - Contains iconType, size, color, etc.
   * @returns {Promise<Object>} Result with icon image
   */
  static async createIcon(inputs) {
    const { 
      iconType = 'default', // default, check, cross, arrow, star, heart, etc.
      size = 64,
      color = '#4CAF50',
      backgroundColor = 'transparent',
      filePath,
      strokeWidth = 2,
      fill = false
    } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Set background
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, size, size);
    }
    
    // Draw icon based on type
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const centerX = size / 2;
    const centerY = size / 2;
    const scale = size / 64; // Scale factor for consistent sizing
    
    switch (iconType) {
      case 'check':
        this.drawCheckIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'cross':
        this.drawCrossIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'arrow-right':
        this.drawArrowRightIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'star':
        this.drawStarIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'heart':
        this.drawHeartIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'user':
        this.drawUserIcon(ctx, centerX, centerY, scale, fill);
        break;
      case 'settings':
        this.drawSettingsIcon(ctx, centerX, centerY, scale, fill);
        break;
      default:
        this.drawDefaultIcon(ctx, centerX, centerY, scale, fill);
    }
    
    const outputPath = filePath || path.join(uploadsDir, `icon-${iconType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size: size,
      iconType: iconType,
      message: `${iconType} icon created successfully at ${outputPath}`
    };
  }

  /**
   * Draw check icon
   */
  static drawCheckIcon(ctx, x, y, scale, fill) {
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale, y);
    ctx.lineTo(x - 3 * scale, y + 7 * scale);
    ctx.lineTo(x + 10 * scale, y - 7 * scale);
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw cross icon
   */
  static drawCrossIcon(ctx, x, y, scale, fill) {
    ctx.beginPath();
    ctx.moveTo(x - 8 * scale, y - 8 * scale);
    ctx.lineTo(x + 8 * scale, y + 8 * scale);
    ctx.moveTo(x + 8 * scale, y - 8 * scale);
    ctx.lineTo(x - 8 * scale, y + 8 * scale);
    
    if (fill) {
      ctx.lineWidth = 4 * scale;
      ctx.stroke();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw arrow right icon
   */
  static drawArrowRightIcon(ctx, x, y, scale, fill) {
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale, y);
    ctx.lineTo(x + 6 * scale, y);
    ctx.lineTo(x + 2 * scale, y - 6 * scale);
    ctx.moveTo(x + 6 * scale, y);
    ctx.lineTo(x + 2 * scale, y + 6 * scale);
    
    if (fill) {
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw star icon
   */
  static drawStarIcon(ctx, x, y, scale, fill) {
    const spikes = 5;
    const outerRadius = 10 * scale;
    const innerRadius = 5 * scale;
    
    ctx.beginPath();
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw heart icon
   */
  static drawHeartIcon(ctx, x, y, scale, fill) {
    ctx.beginPath();
    ctx.moveTo(x, y + 3 * scale);
    
    // Left curve
    ctx.bezierCurveTo(
      x - 10 * scale, y - 5 * scale,
      x - 10 * scale, y - 12 * scale,
      x, y - 8 * scale
    );
    
    // Right curve
    ctx.bezierCurveTo(
      x + 10 * scale, y - 12 * scale,
      x + 10 * scale, y - 5 * scale,
      x, y + 3 * scale
    );
    
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw user icon
   */
  static drawUserIcon(ctx, x, y, scale, fill) {
    // Head
    ctx.beginPath();
    ctx.arc(x, y - 6 * scale, 6 * scale, 0, Math.PI * 2);
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    
    // Body
    ctx.beginPath();
    ctx.arc(x, y + 8 * scale, 10 * scale, Math.PI, 0);
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw settings icon
   */
  static drawSettingsIcon(ctx, x, y, scale, fill) {
    const teeth = 8;
    const outerRadius = 10 * scale;
    const innerRadius = 7 * scale;
    
    ctx.beginPath();
    
    for (let i = 0; i < teeth * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / teeth;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    
    // Center circle
    ctx.beginPath();
    ctx.arc(x, y, 3 * scale, 0, Math.PI * 2);
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * Draw default icon
   */
  static drawDefaultIcon(ctx, x, y, scale, fill) {
    ctx.beginPath();
    ctx.arc(x, y, 10 * scale, 0, Math.PI * 2);
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    
    ctx.beginPath();
    ctx.arc(x, y, 5 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Create a banner
   * @param {Object} inputs - Contains text, width, height, colors, etc.
   * @returns {Promise<Object>} Result with banner image
   */
  static async createBanner(inputs) {
    const { 
      text = 'Banner',
      width = 800,
      height = 200,
      backgroundColor = '#2196F3',
      textColor = '#ffffff',
      fontSize = 48,
      fontFamily = 'Arial',
      filePath,
      gradientColors,
      backgroundImage,
      pattern = 'none' // none, stripes, dots, grid
    } = inputs;
    
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set background
    if (gradientColors && Array.isArray(gradientColors) && gradientColors.length >= 2) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, gradientColors[0]);
      gradient.addColorStop(1, gradientColors[1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = backgroundColor;
    }
    
    ctx.fillRect(0, 0, width, height);
    
    // Add pattern if requested
    if (pattern !== 'none') {
      this.drawPattern(ctx, width, height, pattern, backgroundColor);
    }
    
    // Add background image if provided
    if (backgroundImage && fs.existsSync(backgroundImage)) {
      try {
        const img = await loadImage(backgroundImage);
        ctx.globalAlpha = 0.3; // Semi-transparent
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1.0; // Reset alpha
      } catch (error) {
        console.warn('Failed to load background image:', error.message);
      }
    }
    
    // Add text with shadow for better readability
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillText(text, width / 2, height / 2);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    const outputPath = filePath || path.join(uploadsDir, `banner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      text: text,
      message: `Banner created successfully at ${outputPath}`
    };
  }

  /**
   * Draw pattern on canvas
   */
  static drawPattern(ctx, width, height, pattern, baseColor) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    switch (pattern) {
      case 'stripes':
        for (let i = 0; i < width + height; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i - height, height);
          ctx.stroke();
        }
        break;
        
      case 'dots':
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let x = 0; x < width; x += 20) {
          for (let y = 0; y < height; y += 20) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
        
      case 'grid':
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        for (let x = 0; x < width; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += 20) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        break;
    }
  }
  
  /**
   * Edit an existing canvas design
   * @param {Object} inputs - Contains filePath, elements to add/modify
   * @returns {Promise<Object>} Result with updated image URL
   */
  static async editCanvas(inputs) {
    const { filePath, elements = [], backgroundColor } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    // Load existing image
    const img = await loadImage(filePath);
    const width = img.width;
    const height = img.height;
    
    // Create canvas with same dimensions
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw existing image
    ctx.drawImage(img, 0, 0, width, height);
    
    // Add new elements
    for (const element of elements) {
      await this.drawElement(ctx, element);
    }
    
    // Determine output path
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-edited-${Date.now()}.png`);
    
    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      elementsAdded: elements.length,
      message: `Canvas edited successfully and saved to ${outputPath}`
    };
  }

  /**
   * Add text to existing canvas
   * @param {Object} inputs - Contains filePath, text, position, styling
   * @returns {Promise<Object>} Result with updated image
   */
  static async addTextToCanvas(inputs) {
    const { filePath, text, x = 100, y = 100, font = '24px Arial', color = '#000000', align = 'left', maxWidth } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    const img = await loadImage(filePath);
    const width = img.width;
    const height = img.height;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw existing image
    ctx.drawImage(img, 0, 0, width, height);
    
    // Add text
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    
    if (maxWidth) {
      ctx.fillText(text, x, y, maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-text-${Date.now()}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      textAdded: text,
      message: `Text added to canvas successfully at ${outputPath}`
    };
  }

  /**
   * Add shape to existing canvas
   * @param {Object} inputs - Contains filePath, shape, position, styling
   * @returns {Promise<Object>} Result with updated image
   */
  static async addShapeToCanvas(inputs) {
    const { filePath, shape = 'rectangle', x = 100, y = 100, width = 100, height = 100, color = '#000000', fill = true, lineWidth = 2 } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    const img = await loadImage(filePath);
    const canvasWidth = img.width;
    const canvasHeight = img.height;
    
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    
    // Draw existing image
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    
    // Add shape
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    const element = {
      type: shape,
      x: x,
      y: y,
      width: width,
      height: height,
      color: color,
      fill: fill,
      radius: Math.min(width, height) / 2
    };
    
    await this.drawElement(ctx, element);
    
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-shape-${Date.now()}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: canvasWidth,
      height: canvasHeight,
      shapeAdded: shape,
      message: `Shape added to canvas successfully at ${outputPath}`
    };
  }

  /**
   * Apply filter to canvas
   * @param {Object} inputs - Contains filePath, filter type
   * @returns {Promise<Object>} Result with filtered image
   */
  static async applyFilter(inputs) {
    const { filePath, filter = 'grayscale', intensity = 1.0 } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    const img = await loadImage(filePath);
    const width = img.width;
    const height = img.height;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw existing image
    ctx.drawImage(img, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Apply filter
    switch (filter) {
      case 'grayscale':
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = data[i] * (1 - intensity) + avg * intensity;     // Red
          data[i + 1] = data[i + 1] * (1 - intensity) + avg * intensity; // Green
          data[i + 2] = data[i + 2] * (1 - intensity) + avg * intensity; // Blue
        }
        break;
        
      case 'sepia':
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
          data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
          data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
        }
        break;
        
      case 'invert':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];       // Red
          data[i + 1] = 255 - data[i + 1]; // Green
          data[i + 2] = 255 - data[i + 2]; // Blue
        }
        break;
        
      case 'brightness':
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] + (intensity * 100));       // Red
          data[i + 1] = Math.min(255, data[i + 1] + (intensity * 100)); // Green
          data[i + 2] = Math.min(255, data[i + 2] + (intensity * 100)); // Blue
        }
        break;
        
      case 'contrast':
        const factor = (259 * (intensity * 100 + 255)) / (255 * (259 - intensity * 100));
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
        break;
    }
    
    // Put modified image data back
    ctx.putImageData(imageData, 0, 0);
    
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-${filter}-${Date.now()}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      filterApplied: filter,
      intensity: intensity,
      message: `${filter} filter applied successfully at ${outputPath}`
    };
  }

  /**
   * Resize canvas
   * @param {Object} inputs - Contains filePath, newWidth, newHeight
   * @returns {Promise<Object>} Result with resized image
   */
  static async resizeCanvas(inputs) {
    const { filePath, width: newWidth, height: newHeight, maintainAspectRatio = true } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    const img = await loadImage(filePath);
    const originalWidth = img.width;
    const originalHeight = img.height;
    
    let finalWidth = newWidth;
    let finalHeight = newHeight;
    
    // Maintain aspect ratio if requested
    if (maintainAspectRatio && newWidth && newHeight) {
      const aspectRatio = originalWidth / originalHeight;
      if (newWidth / newHeight > aspectRatio) {
        finalWidth = newHeight * aspectRatio;
        finalHeight = newHeight;
      } else {
        finalWidth = newWidth;
        finalHeight = newWidth / aspectRatio;
      }
    }
    
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');
    
    // Draw resized image
    ctx.drawImage(img, 0, 0, originalWidth, originalHeight, 0, 0, finalWidth, finalHeight);
    
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-resized-${Math.round(finalWidth)}x${Math.round(finalHeight)}-${Date.now()}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: finalWidth,
      height: finalHeight,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      message: `Canvas resized successfully at ${outputPath}`
    };
  }

  /**
   * Add gradient to canvas
   * @param {Object} inputs - Contains filePath, gradient type, colors
   * @returns {Promise<Object>} Result with gradient overlay
   */
  static async addGradient(inputs) {
    const { filePath, gradientType = 'linear', colors = ['#ffffff', '#000000'], direction = 'vertical', opacity = 0.5 } = inputs;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('File not found: ' + (filePath || 'undefined'));
    }
    
    const img = await loadImage(filePath);
    const width = img.width;
    const height = img.height;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw existing image
    ctx.drawImage(img, 0, 0, width, height);
    
    // Create gradient
    let gradient;
    if (gradientType === 'linear') {
      if (direction === 'vertical') {
        gradient = ctx.createLinearGradient(0, 0, 0, height);
      } else if (direction === 'horizontal') {
        gradient = ctx.createLinearGradient(0, 0, width, 0);
      } else if (direction === 'diagonal') {
        gradient = ctx.createLinearGradient(0, 0, width, height);
      }
    } else if (gradientType === 'radial') {
      gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
    }
    
    // Add color stops
    if (colors.length >= 2) {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);
    } else if (colors.length === 1) {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[0]);
    }
    
    // Apply gradient with opacity
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1.0;
    
    const outputPath = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, `-gradient-${Date.now()}.png`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return {
      type: 'image',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      width: width,
      height: height,
      gradientType: gradientType,
      direction: direction,
      message: `Gradient added successfully at ${outputPath}`
    };
  }
  
  /**
   * Draw an element on the canvas
   * @param {CanvasRenderingContext2D} ctx - The drawing context
   * @param {Object} element - Element definition
   * @private
   */
  static async drawElement(ctx, element) {
    const { type, x = 0, y = 0, ...props } = element;
    
    // Save context state
    ctx.save();
    
    // Set styles if provided
    if (props.color) {
      ctx.fillStyle = props.color;
      ctx.strokeStyle = props.color;
    }
    
    if (props.lineWidth) {
      ctx.lineWidth = props.lineWidth;
    }
    
    if (props.opacity !== undefined) {
      ctx.globalAlpha = props.opacity;
    }
    
    switch (type) {
      case 'rectangle':
        if (props.fill !== false) {
          ctx.fillRect(x, y, props.width || 100, props.height || 50);
        }
        if (props.stroke !== false) {
          ctx.strokeRect(x, y, props.width || 100, props.height || 50);
        }
        break;
        
      case 'roundedRectangle':
        this.drawRoundedRectangle(ctx, x, y, props.width || 100, props.height || 50, props.radius || 10, props.fill !== false, props.stroke !== false);
        break;
        
      case 'circle':
        ctx.beginPath();
        ctx.arc(x, y, props.radius || 25, 0, 2 * Math.PI);
        if (props.fill !== false) {
          ctx.fill();
        }
        if (props.stroke !== false) {
          ctx.stroke();
        }
        break;
        
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(x, y, props.radiusX || 50, props.radiusY || 30, props.rotation || 0, 0, 2 * Math.PI);
        if (props.fill !== false) {
          ctx.fill();
        }
        if (props.stroke !== false) {
          ctx.stroke();
        }
        break;
        
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(x + (props.width || 100) / 2, y);
        ctx.lineTo(x + (props.width || 100), y + (props.height || 100));
        ctx.lineTo(x, y + (props.height || 100));
        ctx.closePath();
        if (props.fill !== false) {
          ctx.fill();
        }
        if (props.stroke !== false) {
          ctx.stroke();
        }
        break;
        
      case 'polygon':
        this.drawPolygon(ctx, x, y, props.radius || 50, props.sides || 6, props.fill !== false, props.stroke !== false);
        break;
        
      case 'star':
        this.drawStar(ctx, x, y, props.outerRadius || 50, props.innerRadius || 25, props.points || 5, props.fill !== false, props.stroke !== false);
        break;
        
      case 'text':
        if (props.font) {
          ctx.font = props.font;
        }
        if (props.color) {
          ctx.fillStyle = props.color;
        }
        ctx.textAlign = props.align || 'left';
        ctx.textBaseline = props.baseline || 'top';
        
        if (props.maxWidth) {
          ctx.fillText(props.text || '', x, y, props.maxWidth);
        } else {
          ctx.fillText(props.text || '', x, y);
        }
        break;
        
      case 'strokeText':
        if (props.font) {
          ctx.font = props.font;
        }
        if (props.color) {
          ctx.strokeStyle = props.color;
        }
        if (props.lineWidth) {
          ctx.lineWidth = props.lineWidth;
        }
        ctx.textAlign = props.align || 'left';
        ctx.textBaseline = props.baseline || 'top';
        ctx.strokeText(props.text || '', x, y);
        break;
        
      case 'line':
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(props.x2 || x + 100, props.y2 || y + 100);
        ctx.stroke();
        break;
        
      case 'bezier':
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(
          props.cp1x || x + 50, props.cp1y || y - 50,
          props.cp2x || x + 100, props.cp2y || y + 50,
          props.x2 || x + 150, props.y2 || y
        );
        ctx.stroke();
        break;
        
      case 'image':
        if (props.src && fs.existsSync(props.src)) {
          const img = await loadImage(props.src);
          if (props.width && props.height) {
            ctx.drawImage(img, x, y, props.width, props.height);
          } else if (props.width) {
            const ratio = props.width / img.width;
            ctx.drawImage(img, x, y, props.width, img.height * ratio);
          } else if (props.height) {
            const ratio = props.height / img.height;
            ctx.drawImage(img, x, y, img.width * ratio, props.height);
          } else {
            ctx.drawImage(img, x, y);
          }
        }
        break;
        
      case 'arc':
        ctx.beginPath();
        ctx.arc(x, y, props.radius || 50, props.startAngle || 0, props.endAngle || Math.PI);
        ctx.stroke();
        break;
        
      case 'arcFill':
        ctx.beginPath();
        ctx.arc(x, y, props.radius || 50, props.startAngle || 0, props.endAngle || Math.PI);
        ctx.fill();
        break;
        
      default:
        console.warn(`Unknown element type: ${type}`);
        break;
    }
    
    // Restore context state
    ctx.restore();
  }

  /**
   * Draw a rounded rectangle
   */
  static drawRoundedRectangle(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }

  /**
   * Draw a polygon
   */
  static drawPolygon(ctx, x, y, radius, sides, fill, stroke) {
    if (sides < 3) return;
    
    ctx.beginPath();
    
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }

  /**
   * Draw a star
   */
  static drawStar(ctx, x, y, outerRadius, innerRadius, points, fill, stroke) {
    ctx.beginPath();
    
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      
      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }
}

module.exports = { CanvasExecutor };
