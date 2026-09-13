/**
 * XlsxExecutor - Excel 电子表格生成
 * 使用 exceljs 生成真实 .xlsx 文件
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

class XlsxExecutor {
  /**
   * Execute Excel operations
   * @param {Object} inputs - Input parameters
   * @returns {Promise<Object>} Result object with file path
   */
  static async execute(inputs = {}) {
    const action = inputs.action || 'create';
    try {
      switch (action) {
      case 'create':
        return await this.createSpreadsheet(inputs);
      case 'createWithData':
        return await this.createWithData(inputs);
      case 'read':
        return await this.readSpreadsheet(inputs);
      default:
        throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      throw new Error(`XlsxExecutor failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Create a basic spreadsheet
   */
  static async createSpreadsheet(inputs) {
    const { title, sheetName } = inputs;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'UltraWork Skill Executor';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName || 'Sheet1');
    if (title) {
      sheet.getCell('A1').value = title;
      sheet.getCell('A1').font = { bold: true, size: 14 };
      sheet.getCell('A1').alignment = { horizontal: 'center' };
      sheet.mergeCells(`A1:${this._colName(Math.max(4, (inputs.columns || 4)))}1`);
    }

    const outputPath = this._resolveOutputPath(inputs, 'xlsx');
    await workbook.xlsx.writeFile(outputPath);

    let size = 0;
    try { size = fs.statSync(outputPath).size; } catch (e) { /* stat 失败用 0 */ }

    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size,
      message: `Excel 表格已生成: ${path.basename(outputPath)}`
    };
  }

  /**
   * Create spreadsheet with data (headers + rows)
   */
  static async createWithData(inputs) {
    const { title, headers = [], data = [], sheetName } = inputs;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'UltraWork Skill Executor';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName || 'Sheet1');
    let row = 1;

    if (title) {
      sheet.getCell(`A${row}`).value = title;
      sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
      sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
      sheet.mergeCells(`A${row}:${this._colName(Math.max(1, headers.length || 1))}${row}`);
      row++;
    }

    if (Array.isArray(headers) && headers.length > 0) {
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      });
      sheet.getRow(row).commit();
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item)) {
          sheet.addRow(item);
        } else if (item && typeof item === 'object') {
          sheet.addRow(Object.values(item));
        }
      }
    }

    if (headers.length > 0) {
      sheet.columns = headers.map((h, i) => ({
        header: h,
        key: String(i),
        width: Math.max(12, String(h).length + 4)
      }));
    }

    const outputPath = this._resolveOutputPath(inputs, 'xlsx');
    await workbook.xlsx.writeFile(outputPath);

    let size = 0;
    try { size = fs.statSync(outputPath).size; } catch (e) { /* stat 失败用 0 */ }

    return {
      type: 'file',
      path: outputPath,
      url: `/skill-outputs/${path.basename(outputPath)}`,
      size,
      message: `Excel 数据表已生成: ${path.basename(outputPath)}`
    };
  }

  /**
   * Read spreadsheet content (extract text)
   */
  static async readSpreadsheet(inputs) {
    const { filePath } = inputs;
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheets = [];
    workbook.eachSheet((sheet) => {
      const rows = [];
      sheet.eachRow((row) => {
        rows.push(row.values.filter((v) => v !== undefined));
      });
      sheets.push({ name: sheet.name, rows: rows.slice(0, 50) });
    });
    return {
      type: 'data',
      sheets,
      message: `读取到 ${sheets.length} 个工作表`
    };
  }

  /**
   * Resolve output path under uploads/skills (path-traversal safe)
   */
  static _resolveOutputPath(inputs, _ext) {
    const skillName = (inputs && inputs.skill && inputs.skill.name) || 'unknown';
    const uploadsDir = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const { filePath } = inputs;
    return filePath
      ? path.join(uploadsDir, path.basename(filePath))
      : path.join(uploadsDir, `xlsx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`);
  }

  /**
   * Convert column index to Excel column name (1-based)
   */
  static _colName(index) {
    let name = '';
    let n = index;
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name || 'A';
  }
}

module.exports = { XlsxExecutor };