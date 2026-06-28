/**
 * 安全扫描脚本 — 编码审计发现为可重复的自动化检查
 * 检测本次安全审计中发现的常见漏洞模式
 *
 * 运行: node scripts/security-scan.js
 */
const fs = require('fs');
const path = require('path');
const { loadRules, getRules, isCustomMatchRule } = require('./rules');

const ROOT = path.resolve(__dirname, '..');
const RULES_DIR = path.join(__dirname, 'rules');
const EXCLUDE_DIRS = ['node_modules', '.git', '.opencode', 'tradingagents-cn', 'shihao-', 'test', 'tests', 'scripts', 'frontend', 'examples', 'coverage'];
const EXCLUDE_PATTERNS = [/node_modules/, /\.test\.js$/, /\.spec\.js$/, /tradingagents-cn/, /shihao-/];

let totalErrors = 0;
let totalWarnings = 0;
let _scanResults = null;

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

function initRules() {
  if (getRules().length === 0) {
    loadRules(RULES_DIR);
  }
  return getRules();
}

function scanFileWithRules(filePath, resultsArray) {
  const relativePath = path.relative(ROOT, filePath);
  if (shouldExclude(relativePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rules = initRules();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (isCustomMatchRule(rule)) {
      rule.match(lines, relativePath, filePath, (severity, ruleId, detail, message) => {
        if (resultsArray) resultsArray.push({ severity, ruleId, file: relativePath, message, detail });
        report(severity, ruleId, detail, relativePath, message);
      });
      continue;
    }
    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!pattern.test(line)) continue;
        if (rule.excludePatterns && rule.excludePatterns.some(ep => ep.test(line))) continue;
        if (rule.context && rule.context.requireKeywords && rule.context.requireKeywords.length > 0) {
          const hasKeyword = rule.context.requireKeywords.some(kw =>
            line.toLowerCase().includes(kw.toLowerCase())
          );
          if (!hasKeyword) continue;
        }
        const detail = `行 ${i + 1}: ${line.trim().substring(0, 100)}`;
        if (resultsArray) resultsArray.push({ severity: rule.severity, ruleId: rule.id, file: relativePath, message: rule.description, detail });
        report(rule.severity, rule.id, detail, relativePath, rule.description);
      }
    }
  }
}

function getAllJSFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (EXCLUDE_DIRS.some((e) => fullPath.includes(e))) continue;
      if (entry.isDirectory()) {
        results.push(...getAllJSFiles(fullPath));
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js')) {
        results.push(fullPath);
      }
    }
  } catch { /* 跳过无权限目录 */ }
  return results;
}

function scanFile(filePath, resultsArray) {
  _scanResults = resultsArray || null;
  const relativePath = path.relative(ROOT, filePath);
  if (shouldExclude(relativePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 检查1: file.originalname 未经过 sanitization 就用于文件操作 (S3 key 路径遍历)
  for (let i = 0; i < lines.length; i++) {
    if (!/file\.originalname/.test(lines[i])) continue;
    // 已知安全的 sanitizer: 如果同一行或上一行调用了这些函数，跳过
    if (/path\.basename\(|Validation\.sanitizeString\(|encodeURIComponent\(|_generateKey\(/.test(lines[i])) continue;
    if (/filename:\s*req\.file\.originalname|originalName:\s*file\.originalname/.test(lines[i])) continue;
    report('HIGH', 'S3_KEY_PATH_TRAVERSAL', `行 ${i + 1}: ${lines[i].trim().substring(0, 100)}`, relativePath, 'file.originalname 未经 path.basename() 等 sanitizer 直接使用');
  }

  // 检查2: error.message 直接返回客户端
  scanPattern(
    filePath, lines, relativePath,
    /\.json\(\s*\{[^}]*error:\s*error\.message\s*\}/,
    'ERROR_MESSAGE_LEAK',
    'error.message 直接返回客户端，应用通用错误消息替代',
    'MEDIUM'
  );

  // 检查3: RegExp 从用户输入创建 (ReDoS)
  for (let i = 0; i < lines.length; i++) {
    if (!/new\s+RegExp\(/.test(lines[i])) continue;
    // 跳过已知安全的假阳性:
    //   - .source (从预编译 RegExp 复制)
    //   - escapeRegex( (输入已在同句或前句转义)
    //   - 静态字符串字面量 (不含模板变量)
    const prevLine = i > 0 ? lines[i - 1] : '';
    if (/\.source/.test(lines[i]) || /escapeRegex\(/.test(prevLine + lines[i]) || !/\$\{/.test(lines[i]) || /\.replace\(\/.+?\]\/g/.test(prevLine)) continue;
    // 跳过模板渲染模式 (Object.entries 上下文中的 key 是系统可控的)
    const contextBlock = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 2)).join('\n');
    if (/Object\.entries\(/.test(contextBlock)) continue;
    // 跳过 HTML 消毒模式 (dangerousTags 硬编码数组)
    if (/\bdangerousTags\b/.test(contextBlock)) continue;
    // 跳过 for...of 硬编码数组迭代模式
    if (/for\s*\([^)]*of\s+\w+\s*\)/.test(contextBlock)) continue;
    report('MEDIUM', 'USER_REGEX', `行 ${i + 1}: ${lines[i].trim().substring(0, 100)}`, relativePath, '动态创建 RegExp，需验证/限制输入防止 ReDoS');
  }

  // 检查4: existsSync + unlinkSync TOCTOU (无 try-catch)
  for (let i = 0; i < lines.length - 5; i++) {
    if (/existsSync/.test(lines[i]) && /unlinkSync|renameSync|writeFileSync/.test(lines[i + 1]) || /existsSync/.test(lines[i]) && /unlinkSync|renameSync|writeFileSync/.test(lines[i + 2])) {
      const block = lines.slice(Math.max(0, i - 2), i + 6).join('\n');
      if (!block.includes('try') && !block.includes('catch')) {
        report('MEDIUM', 'TOCTOU_FILE', `existsSync + 文件操作未包 try-catch (行 ${i + 1})`, relativePath, lines[i].trim());
      }
    }
  }

  // 检查5: innerHTML 赋值 (前端 XSS)
  scanPattern(
    filePath, lines, relativePath,
    /\.innerHTML\s*=/,
    'INNER_HTML_XSS',
    'innerHTML 赋值可能导致 XSS，确认内容已 sanitize 或改用 textContent',
    'MEDIUM'
  );

  // 检查6: 硬编码密钥/令牌/密码 (A02)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*\/\*/.test(line)) continue;
    if (/\.test\.js|\.spec\.js|mock|example|fixture/i.test(relativePath)) break;
    if (/process\.env/.test(line) || /require\(/.test(line) || /import\s/.test(line)) continue;
    if (/['"]default['"]\s*[:=]/.test(line)) continue;
    const m = line.match(/(?:password|apiKey|api_key|api_secret|secret|private_key|accessToken|refreshToken)\s*[:=]\s*['"]([^'"\s]{8,})['"]/);
    if (m && !/placeholder|changeme|your-|example|test-|dummy|fake/i.test(m[1])) {
      report('HIGH', 'HARDCODED_SECRET', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '硬编码密钥/密码，应从环境变量或密钥管理服务读取');
    }
  }

  // 检查7: SQL 注入 — 字符串拼接/模板字面量 (A03)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM/i.test(line)) {
      if (/\$\{/.test(line) || /['"`]\s*\+/.test(line)) {
        if (/\.query\(|\.execute\(|WHERE\s+\w+\s*=\s*\?|WHERE\s+\w+\s*=\s*\$|sequelize|knex|prisma|typeorm|escape\(|sanitize\(/.test(line)) continue;
        if (/LIMIT\s+\$\{|OFFSET\s+\$\{|ORDER BY\s+\$\{/.test(line)) continue;
        if (/^(const|let|var)\s+\w+\s*=/.test(line.trim())) continue;
        report('HIGH', 'SQL_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '可能的 SQL 注入 — 使用参数化查询或 ORM');
      }
    }
  }

  // 检查8: 命令注入 — exec/spawn 使用变量参数 (A03)
  // spawn/spawnSync/execFile/execFileSync 默认不调用 shell，变量参数安全
  // exec/execSync 默认调用 shell，变量参数可能导致命令注入
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // execSync/exec 是唯一默认调用 shell 的，需要标记
    if (/\b(exec|execSync)\s*\(/.test(line) && !/\b(execFile|execFileSync)\s*\(/.test(line)) {
      // 跳过文档字符串/注释中的代码示例
      if (/^\s*['"`]/.test(line) || /^\s*\/\//.test(line)) continue;
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (prevLine.trim().startsWith('//')) continue;
      const hasVar = /\$\{|['"`]\s*\+/.test(line);
      if (hasVar) {
        if (/shell:\s*false/.test(line)) continue;
        if (/npm\s*(run|install|test)|npx\s+\w+|git\s+(status|log|diff|checkout)/.test(line)) continue;
        report('HIGH', 'COMMAND_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'exec/execSync 含变量参数，可能导致命令注入');
      }
    }
    // spawn/spawnSync/execFile/execFileSync 仅当 shell:true 时需标记
    if (/\b(spawn|spawnSync|execFile|execFileSync)\s*\(/.test(line)) {
      if (/shell:\s*true/.test(line)) {
        if (/npm\s*(run|install|test)|npx\s+\w+|git\s+(status|log|diff|checkout)/.test(line)) continue;
        report('HIGH', 'COMMAND_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'spawn/execFile 设 shell:true 且含变量参数，可能导致命令注入');
      }
    }
  }

  // 检查9: 原型污染 — 用户输入用于对象合并 (A03)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Object\.assign\s*\(/.test(line) || /\{\.\.\.\w+,\s*\.\.\.\w+\}/.test(line)) {
      if (/req\.|body|query|params|input|userInput/.test(line)) {
        report('MEDIUM', 'PROTOTYPE_POLLUTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '用户输入直接用于对象合并，可能导致原型污染');
      }
    }
  }

  // 检查10: SSRF — 用户可控 URL 传入 fetch/request (A10)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:fetch|axios|request|got|superagent)\s*\(/.test(line)) {
      if (/\$\{|['"`]\s*\+/.test(line) && /req\.|\.query|\.params|\.body|\.url|input|callbackUrl|redirectUrl|returnUrl/i.test(line)) {
        if (/api\.|BASE_URL|baseURL|API_ENDPOINT|ALLOWED_DOMAIN|\.env\./i.test(line)) continue;
        report('MEDIUM', 'SSRF', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '用户可控 URL 传入 fetch/request，可能导致 SSRF');
      }
    }
  }

  // 检查11: 敏感数据记录到日志 (A09)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/console\.(log|info)|logger\.(info|debug|log)|winston\.(info|debug)/.test(line)) {
      if (/(password|token|secret|credential|apiKey|authorization)\s*[:=]\s*.+/.test(line) && !/masking|sanitize|redact|hidden|\*/.test(line)) {
        report('MEDIUM', 'SENSITIVE_LOG', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '可能将敏感数据写入日志');
      }
    }
  }

  // 检查12: Host header 注入 (A05)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/req\.headers\.host|req\.get\(['"]host['"]\)/.test(line)) {
      const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
      if (/(redirect|Location|res\.redirect|fetch|URL|href)/i.test(contextBlock)) {
        report('MEDIUM', 'HOST_HEADER_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'req.headers.host 可能被篡改，用于 URL 构建或重定向有风险');
      }
    }
  }

  // 检查13: CORS 通配符 + credentials (A05)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Access-Control-Allow-Origin/.test(line)) {
      if (/\*\s*['"]/.test(line) || /['"]\*['"]/.test(line)) {
        const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
        if (/credentials|withCredentials/.test(contextBlock)) {
          report('HIGH', 'CORS_WILDCARD_CREDENTIALS', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '通配符 CORS 与 credentials 同时使用，存在安全风险');
        } else {
          report('MEDIUM', 'CORS_WILDCARD', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'CORS 通配符过于宽松，建议限制具体域名');
        }
      }
    }
  }

  // 检查14: 开放重定向 (A01)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/res\.redirect\s*\(/.test(line)) {
      const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
      if (/(req\.|query\.|params\.|body\.|\.url|\.originalUrl|returnUrl|redirectUrl|next|to\b)/i.test(contextBlock) && !/allowlist|allowed|valid|whitelist|sanitize|validate/i.test(contextBlock)) {
        report('MEDIUM', 'OPEN_REDIRECT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '基于用户输入的重定向可能导致开放重定向漏洞');
      }
    }
  }

  // 检查15: 不安全的反序列化 (A08)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/JSON\.parse\s*\(/.test(line)) {
      // 跳过安全模式: 读取本地文件、安全克隆、解密
      if (/(fs\.readFileSync|JSON\.stringify|this\.decrypt)/.test(line)) continue;
      // 跳过已有 try-catch 保护的
      const blockBefore = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (blockBefore.includes('try')) continue;
      // 检测来自用户输入的 JSON.parse
      if (/req\.|body\b|query|params|input/.test(line)) {
        report('MEDIUM', 'INSECURE_DESERIALIZATION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '用户输入 JSON.parse 未包 try-catch，可能导致异常');
      }
    }
  }

  // 检查16: NoSQL 注入 — MongoDB 操作符拼接/直接赋值用户输入 (CWE-943)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\$\s*(where|gt|gte|lt|lte|ne|nin|regex|exists|type|mod|text|search)\s*[:=]/.test(line)) {
      // 字符串拼接模式: { $where: `...${userInput}...` }
      const hasConcat = /\$\{|['"`]\s*\+/.test(line) && /req\.|body|query|params|\.username|\.password|\.email|\.search|\.input/i.test(line);
      // 直接赋值模式: { $regex: req.query.search }
      const hasDirectAssignment = /\$\s*(regex|where)\s*[:=]\s*(req\.|body|query|params)/.test(line);
      if (hasConcat || hasDirectAssignment) {
        report('HIGH', 'NOSQL_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'MongoDB 操作符中拼接/赋值用户输入，可能导致 NoSQL 注入');
      }
    }
  }

  // 检查17: DOM XSS 扩展 — document.write/insertAdjacentHTML/outerHTML (CWE-79)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    if (/document\.(write|writeln)\s*\(/.test(line) || /\.insertAdjacentHTML\s*\(/.test(line) || /\.outerHTML\s*=/.test(line)) {
      // 参数含变量或表达式（不全是静态字符串）则标记
      if (/\$\{|['"`]\s*\+/.test(line) || !/['"`]/.test(line) || /\b(req|body|query|params|input|data|value|text|html|url|name|user|content|msg|result)\b/.test(line)) {
        report('HIGH', 'DOM_XSS_EXTENDED', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'DOM XSS 注入点 — document.write/insertAdjacentHTML/outerHTML');
      }
    }
  }

  // 检查18: Math.random 用于安全上下文 (CWE-338)
  // 仅标记用于安全凭据生成的 Math.random，排除文本生成/命名等非安全场景
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bMath\.random\(\)/.test(line)) {
      // 跳过文件命名/路径构建场景
      if (/tempFile|tmpdir|extract|filename|path\.join|folder|dir/i.test(line)) continue;
      // 跳过随机文本/数组选择场景 (非安全)
      if (/concepts|keywords|phrases|adjectives|nouns|verbs|choices|items|candidates/i.test(line)) continue;
      // 仅标记真正的安全凭据上下文
      if (/\b(token|secret|password|csrf|nonce)\b/i.test(line) || /\bapiKey\b|\bapi_key\b|\bsession[^-\w]|\bjwt\b|\bauth\b|\breset\b/i.test(line)) {
        report('HIGH', 'INSECURE_RANDOM', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'Math.random() 用于安全上下文（token/secret/key），应使用 crypto.randomBytes');
      }
    }
  }

  // 检查19: 通用路径遍历 — path.join/sendFile/createReadStream 含用户输入 (CWE-22)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:path\.join|res\.sendFile|fs\.createReadStream)\s*\(/.test(line)) {
      // 要求明确出现用户输入来源 (req/body/query/params/file)，避免纯变量模板误报
      const hasUserSource = /req\.|\.query\.|\.params\.|\.body\.|\.file\.|userInput/i.test(line);
      const hasUserContext = /\b(input|upload|download)\b/i.test(line);
      if (hasUserSource || (hasUserContext && /\$\{/.test(line))) {
        if (/Validator|validate|sanitize|allowlist|allowed|path\.basename|encodeURIComponent/i.test(line)) continue;
        report('HIGH', 'PATH_TRAVERSAL_GENERIC', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '用户输入用于文件路径操作，可能导致路径遍历');
      }
    }
  }

  // 检查20: TLS 配置弱 — rejectUnauthorized: false (CWE-295)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED)/.test(line)) {
      if (/rejectUnauthorized\s*[:=]\s*(false|null|0)/.test(line)) {
        report('HIGH', 'WEAK_TLS', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'rejectUnauthorized 设为 false，禁用 TLS 证书验证');
      }
      if (/NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*['"`]?0['"`]?/.test(line) || /['"`]0['"`]\s*[:=]\s*['"`]?0['"`]?/.test(line)) {
        report('HIGH', 'WEAK_TLS_ENV', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'NODE_TLS_REJECT_UNAUTHORIZED 设为 0，禁用 TLS 验证');
      }
    }
  }

  // 检查21: 弱哈希 — md5/sha1 用于安全上下文 (CWE-327)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:['"`]md5['"`]|['"`]sha1['"`])/.test(line) && /createHash/.test(line)) {
      if (/(password|token|secret|key|sign|auth|hash|hmac)/i.test(line)) {
        report('HIGH', 'WEAK_HASH', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'md5/sha1 用于安全相关哈希，建议使用 sha256 或更高');
      }
    }
  }

  // 检查22: 日志伪造 — 用户输入直接拼入日志 (CWE-117)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:console\.(log|info|warn|error)|logger\.\w+|winston\.\w+)\s*\(/.test(line)) {
      if (/['"`]\s*\+/.test(line) && /req\.|\.body|\.query|\.params|\.ip|\.url/.test(line)) {
        if (/(input|log|message|msg)\s*[:=]\s*['"`]/.test(line) && /sanitize|escape|trim|replace/.test(line)) continue;
        report('MEDIUM', 'LOG_FORGING', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, '用户输入直接拼入日志，可能导致日志伪造');
      }
    }
  }

  // 检查23: eval 变体 — setTimeout/setInterval/new Function 字符参数 (CWE-95)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:setTimeout|setInterval|new Function)\s*\(/.test(line)) {
      // 字符串拼接/模板: setTimeout('alert(' + x + ')', 100)
      const hasStringBuilding = /\$\{|['"`]\s*\+/.test(line) && /(return|alert|console|eval|process|require|fetch)/i.test(line);
      // 纯变量参数（非函数、非箭头函数）: setTimeout(userInput, 100)
      const isBareVariable = /setTimeout|setInterval/.test(line) && /\(\s*\w+\s*[,)]/.test(line) && !/\bfunction\b/.test(line) && !/=>/.test(line) && !/['"`]/.test(line);
      if (hasStringBuilding) {
        report('HIGH', 'EVAL_VARIANT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'setTimeout/setInterval/Function 含动态字符串，可执行任意代码');
      }
      // 变量参数: 仅当变量来自用户输入或变量名暗示为代码时才标记
      if (isBareVariable && /code|script|cmd|command|input|payload|expr/i.test(line)) {
        report('MEDIUM', 'EVAL_VARIABLE_ARG', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'setTimeout/setInterval 含变量参数，若为字符串则等效 eval');
      }
    }
  }

  // 检查24: body parser 未设 limit — express.json/urlencoded 缺少 limit (CWE-770)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:express\.json|express\.urlencoded|bodyParser\.json)\s*\(/.test(line)) {
      if (!/limit\s*[:=]/.test(line)) {
        report('LOW', 'MISSING_BODY_LIMIT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, relativePath, 'express.json/urlencoded 未显式设置 limit，建议根据业务显式配置');
      }
    }
  }
}

function scanPattern(filePath, lines, relativePath, regex, ruleId, message, severity) {
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      report(severity, ruleId, `行 ${i + 1}: ${lines[i].trim().substring(0, 100)}`, relativePath, message);
    }
  }
}

function report(severity, ruleId, detail, file, message) {
  if (_scanResults) _scanResults.push({ severity, ruleId, file, message, detail });
  const prefix = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🟢';
  const count = severity === 'HIGH' ? totalErrors++ : totalWarnings++;
  console.log(`${prefix} [${severity}] ${ruleId}: ${file}`);
  console.log(`   ${detail}`);
  console.log(`   → ${message}`);
  console.log();
}

function scanFiles(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    scanFile(fp, results);
  }
  return results;
}

module.exports = { scanFile, scanFiles, scanFileWithRules, initRules };

// ===== CLI 入口（仅直接运行执行） =====
if (require.main === module) {
  if (process.env.USE_RULES_ENGINE === 'true') {
    scanFile = scanFileWithRules;
    scanFiles = (filePaths) => {
      const results = [];
      for (const fp of filePaths) {
        scanFileWithRules(fp, results);
      }
      return results;
    };
  }
  if (process.argv.includes('--incremental')) {
    const idx = process.argv.indexOf('--incremental');
    const files = process.argv.slice(idx + 1).filter(f => {
      if (!f || f.startsWith('-')) return false;
      const abs = path.resolve(f);
      if (abs === __filename) return false;
      if (abs.startsWith(path.resolve(__dirname, 'rules'))) return false;
      return true;
    });
    if (files.length === 0) {
      process.exit(0);
    }
    const results = scanFiles(files);
    const highCount = results.filter(r => r.severity === 'HIGH').length;
    console.log(`\n=== 扫描完成: ${highCount} HIGH, ${results.length - highCount} MEDIUM/LOW ===\n`);
    process.exit(highCount > 0 ? 1 : 0);
  } else {
    // 原有全量扫描逻辑（保持完全一致）
    console.log('=== 安全扫描 ===\n');
    const files = getAllJSFiles(ROOT);
    console.log(`扫描 ${files.length} 个 JS 文件...\n`);
    for (const file of files) {
      scanFile(file);
    }
    console.log(`\n=== 扫描完成: ${totalErrors} HIGH, ${totalWarnings} MEDIUM/LOW ===\n`);
    process.exit(totalErrors > 0 ? 1 : 0);
  }
}
