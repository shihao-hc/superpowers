#!/usr/bin/env node
/**
 * data-report.js — 数据报表「接单交付引擎」
 *
 * 用途：把客户给的乱数据（多文件 / 多格式 / 脏数据）→ 干净、可交付的 .xlsx 报表。
 * 场景（对应真实接单需求）：多表合并、数据清洗、分组汇总、格式化输出。
 *
 * 用法：
 *   node scripts/data-report.js clean   --in=原始.xlsx --out=干净.xlsx
 *   node scripts/data-report.js merge   --in=1月.xlsx,2月.xlsx --out=合并.xlsx
 *   node scripts/data-report.js summary --in=原始.xlsx --group=门店 --sum=销售额,数量 --out=汇总.xlsx
 *   node scripts/data-report.js report  --in=原始.xlsx --out=报表.xlsx --group=门店 --sum=销售额
 *   （report = clean → group/summary → 格式化输出 一条龙）
 *
 * 选项：
 *   --in=路径[,路径...]   输入文件（.xlsx / .csv；可多个 → 合并）
 *   --out=路径            输出 .xlsx（默认 输出-<时间戳>.xlsx）
 *   --group=列[,列...]    分组列（summary/report 用）
 *   --sum=列[,列...]      求和列（数字，缺失按 0）
 *   --count               附带「记录数」列
 *   --sheet=名称          输出工作表名（默认「报表」）
 *   --title=标题          首行大标题
 *   --no-format           纯数据不做表头样式/冻结/列宽
 *
 * 只读输入、另存输出，绝不改动客户原文件。
 */

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');

// ===== 参数解析 =====
function parseArgs(argv) {
  const o = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      const v = rest.join('=');
      o[k] = v === '' ? true : v;
    } else {o._.push(a);}
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
const action = args._[0] || '';
const VALID = ['clean', 'merge', 'summary', 'report'];
if (!VALID.includes(action)) {
  console.log('用法: node scripts/data-report.js <clean|merge|summary|report> --in=... --out=...');
  console.log('  例: node scripts/data-report.js report --in=原始.xlsx --out=报表.xlsx --group=门店 --sum=销售额 --count');
  process.exit(action ? 1 : 0);
}

const listArg = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const inFiles = listArg(args.in);
if (inFiles.length === 0) {fail('缺少 --in（输入文件）');}
for (const f of inFiles) {if (!fs.existsSync(f)) {fail(`输入文件不存在: ${f}`);}}

const groupCols = listArg(args.group);
const sumCols = listArg(args.sum);
const wantCount = Boolean(args.count);
const sheetName = typeof args.sheet === 'string' ? args.sheet : '报表';
const title = typeof args.title === 'string' ? args.title : '';
const noFormat = Boolean(args['no-format']);
const outFile = typeof args.out === 'string' ? args.out : `输出-${Date.now()}.xlsx`;

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exit(1);
}

// ===== 读取：把 xlsx/csv 读成 { headers, rows(对象数组) } =====
function cellToPrimitive(v) {
  if (v === null || v === undefined) {return '';}
  if (v instanceof Date) {return v;}
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) {return v.richText.map((t) => t.text).join('');}
    if ('result' in v) {return cellToPrimitive(v.result);}
    if ('text' in v) {return v.text;}
    return '';
  }
  return v;
}

// 文本解码：BOM 优先 → 严格 UTF-8 → 失败则按 GB18030（中国客户 Excel 导出 CSV 默认 GBK，最常见的真实输入坑）
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {return buf.slice(3).toString('utf8');}
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {return new TextDecoder('utf-16le').decode(buf.slice(2));}
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {return new TextDecoder('utf-16be').decode(buf.slice(2));}
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { /* 非合法 UTF-8 → 试 GB18030 */ }
  try { return new TextDecoder('gb18030').decode(buf); } catch (e) { return buf.toString('utf8'); }
}

async function readTable(file) {
  const ext = path.extname(file).toLowerCase();
  const wb = new ExcelJS.Workbook();
  let ws;
  if (ext === '.csv') {
    const text = decodeText(fs.readFileSync(file)); // 自动识别 UTF-8/GBK(GB18030)/UTF-16
    ws = await wb.csv.read(Readable.from([text]));
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    await wb.xlsx.readFile(file);
    ws = wb.worksheets[0];
  } else {
    fail(`不支持的输入格式: ${ext}（支持 .xlsx/.csv）`);
  }
  if (!ws) {fail(`文件中没有工作表: ${file}`);}

  const matrix = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    matrix.push(row.values.slice(1).map(cellToPrimitive));
  });
  if (matrix.length === 0) {return { headers: [], rows: [], source: file };}

  const rawHeaders = matrix[0].map((h) => String(h).trim());
  const headers = dedupeHeaders(rawHeaders);
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = matrix[i][idx] !== undefined ? matrix[i][idx] : ''; });
    rows.push(obj);
  }
  return { headers, rows, source: file };
}

function dedupeHeaders(headers) {
  const seen = {};
  return headers.map((h, i) => {
    const name = h || `列${i + 1}`;
    if (seen[name] === undefined) { seen[name] = 1; return name; }
    seen[name] += 1;
    return `${name}_${seen[name]}`;
  });
}

// ===== 清洗 =====
function parseNumber(v) {
  if (typeof v === 'number') {return v;}
  if (typeof v !== 'string') {return null;}
  const s = v.replace(/[¥$￥,，\s元]/g, '');
  if (s === '') {return null;}
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(v) {
  if (v instanceof Date) {return fmtDate(v);}
  if (typeof v !== 'string') {return v;}
  const s = v.trim();
  // 2026/3/5 · 2026-3-5 · 2026.3.5 · 2026年3月5日
  const m = s.match(/^(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})[日号]?$/);
  if (!m) {return v;}
  const [, y, mo, d] = m;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const pad = (n) => String(n).padStart(2, '0');
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function cleanRows(headers, rows) {
  const out = [];
  for (const r of rows) {
    const obj = {};
    let allEmpty = true;
    for (const h of headers) {
      let v = r[h];
      if (typeof v === 'string') {
        const raw = v;
        v = v.trim();
        const num = parseNumber(v);
        const isPureNumber = v !== '' && !/[^\d.\-+]/.test(v); // 只含数字/符号/小数点
        const hasSymbol = /[¥$￥,，]/.test(raw);
        const looksLikeId = /^0\d/.test(v); // 前导零 → 视为编号，保留文本（避免 00123 变 123）
        // 明显是数值（带货币/千分位符号，或纯数字）→ 转数字；前导零编号保留文本
        if (num !== null && !looksLikeId && (hasSymbol || isPureNumber)) {v = num;}
        else {v = normalizeDate(v);}
      }
      obj[h] = v;
      if (v !== '' && v !== null && v !== undefined) {allEmpty = false;}
    }
    if (!allEmpty) {out.push(obj);}
  }
  // 去重（完全相同的行）
  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const key = headers.map((h) => JSON.stringify(r[h])).join('|');
    if (seen.has(key)) {continue;}
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

// ===== 合并 =====
async function loadTables(files) {
  const tables = [];
  for (const f of files) {tables.push(await readTable(f));}
  return tables;
}

function mergeTables(tables) {
  const headers = [];
  const seen = new Set();
  for (const t of tables) {
    for (const h of t.headers) {if (!seen.has(h)) { seen.add(h); headers.push(h); }}
  }
  const rows = [];
  tables.forEach((t) => {
    for (const r of t.rows) {rows.push(Object.assign(blankOf(headers), r));}
  });
  return { headers, rows };
}

const blankOf = (headers) => Object.fromEntries(headers.map((h) => [h, '']));

// ===== 分组汇总 =====
function summarize(headers, rows, groupBy, sums, count) {
  if (groupBy.length === 0) {fail('summary/report 需要 --group=分组列');}
  const groups = new Map();
  const order = [];
  for (const r of rows) {
    const key = groupBy.map((g) => String(r[g])).join('\u0001');
    if (!groups.has(key)) {
      groups.set(key, { key, sample: r, sums: Object.fromEntries(sums.map((s) => [s, 0])), count: 0 });
      order.push(key);
    }
    const g = groups.get(key);
    g.count += 1;
    for (const s of sums) {
      const n = parseNumber(r[s]);
      if (n !== null) {g.sums[s] += n;}
    }
  }
  const outHeaders = [...groupBy, ...sums.map((s) => s), ...(count ? ['记录数'] : [])];
  const outRows = order.map((k) => {
    const g = groups.get(k);
    const o = {};
    groupBy.forEach((c) => { o[c] = g.sample[c]; });
    sums.forEach((s) => { o[s] = g.sums[s]; });
    if (count) {o['记录数'] = g.count;}
    return o;
  });
  // 按第一个求和列降序（若有）
  if (sums.length) {outRows.sort((a, b) => (parseNumber(b[sums[0]]) || 0) - (parseNumber(a[sums[0]]) || 0));}
  return { headers: outHeaders, rows: outRows };
}

// ===== 写 xlsx（带格式）=====
async function writeXlsx(file, headers, rows, { sheetName, title, noFormat }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'data-report';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  let row = 1;
  if (title) {
    ws.getCell(`A${row}`).value = title;
    ws.getCell(`A${row}`).font = { bold: true, size: 14 };
    ws.mergeCells(row, 1, row, Math.max(1, headers.length));
    row += 1;
  }
  const headerRowIdx = row;
  const headerRow = ws.getRow(row);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
  row += 1;
  for (const r of rows) {
    const line = ws.getRow(row);
    headers.forEach((h, i) => { line.getCell(i + 1).value = r[h] === undefined ? '' : r[h]; });
    row += 1;
  }

  if (!noFormat) {
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    // 自动列宽
    headers.forEach((h, i) => {
      let max = String(h).length;
      for (const r of rows) {max = Math.max(max, String(r[h] === undefined ? '' : r[h]).length);}
      ws.getColumn(i + 1).width = Math.min(50, Math.max(8, max + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
    // 数字列千分位
    headers.forEach((h, i) => {
      const numeric = rows.length > 0 && rows.every((r) => r[h] === '' || typeof r[h] === 'number');
      if (numeric) {ws.getColumn(i + 1).numFmt = '#,##0.00';}
    });
  }

  await wb.xlsx.writeFile(file);
  return { rows: rows.length, headers: headers.length };
}

// ===== 主流程 =====
async function main() {
  const tables = await loadTables(inFiles);
  let headers;
  let rows;
  const steps = [];

  if (action === 'merge') {
    const m = mergeTables(tables);
    headers = m.headers; rows = m.rows;
    steps.push(`合并 ${tables.length} 个文件`);
    rows = cleanRows(headers, rows);
    steps.push('清洗');
  } else {
    // clean / summary / report 都基于（合并后的）单表
    const t = tables.length === 1 ? tables[0] : mergeTables(tables);
    headers = t.headers; rows = t.rows;
    if (tables.length > 1) {steps.push(`合并 ${tables.length} 个文件`);}

    if (action === 'clean') {
      rows = cleanRows(headers, rows);
      steps.push('清洗');
    } else if (action === 'summary') {
      rows = cleanRows(headers, rows);
      steps.push('清洗');
      const s = summarize(headers, rows, groupCols, sumCols, wantCount);
      headers = s.headers; rows = s.rows;
      steps.push(`按 [${groupCols.join(', ')}] 分组汇总`);
    } else if (action === 'report') {
      rows = cleanRows(headers, rows);
      steps.push('清洗');
      if (groupCols.length) {
        const s = summarize(headers, rows, groupCols, sumCols, wantCount);
        headers = s.headers; rows = s.rows;
        steps.push(`按 [${groupCols.join(', ')}] 分组汇总`);
      }
    }
  }

  if (headers.length === 0) {fail('没有读到任何数据（表头为空）');}
  const stat = await writeXlsx(outFile, headers, rows, { sheetName, title, noFormat });

  console.log('✅ 完成');
  console.log(`  动作: ${action}  (${steps.join(' → ')})`);
  console.log(`  输入: ${inFiles.join(', ')}`);
  console.log(`  输出: ${outFile}`);
  console.log(`  结果: ${stat.rows} 行 × ${stat.headers} 列`);
}

main().catch((e) => fail(e.message));
