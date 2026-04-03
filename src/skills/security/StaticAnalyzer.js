/**
 * Static Code Analyzer
 * 集成静态代码分析工具，自动标记高风险代码模式
 * 支持 JavaScript/Python/Java/Go/Rust/C++ 代码分析
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class StaticAnalyzer {
  constructor(options = {}) {
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp', 'analysis');
    this.eslintConfig = options.eslintConfig || this._getDefaultESLintConfig();
    this.banditConfig = options.banditConfig || this._getDefaultBanditConfig();
    
    this._ensureTempDir();
  }

  _ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 获取默认ESLint配置
   */
  _getDefaultESLintConfig() {
    return {
      env: { node: true, es2021: true },
      extends: ['eslint:recommended'],
      parserOptions: { ecmaVersion: 2021 },
      rules: {
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-script-url': 'error',
        'no-caller': 'error',
        'no-extend-native': 'warn',
        'no-global-assign': 'error',
        'no-implicit-globals': 'warn',
        'no-implicit-eval': 'error',
        'no-labels': 'error',
        'no-proto': 'error',
        'no-void': 'error',
        'no-with': 'error',
        'radix': 'error',
        'strict': 'error'
      }
    };
  }

  /**
   * 获取默认Bandit配置
   */
  _getDefaultBanditConfig() {
    return {
      exclude_dirs: ['tests', 'venv', '.git'],
      tests: [
        'B201', 'B301', 'B302', 'B303', 'B304', 'B305', 'B306',
        'B401', 'B402', 'B403', 'B404', 'B405', 'B406', 'B407',
        'B501', 'B502', 'B503', 'B504', 'B505', 'B506', 'B507',
        'B601', 'B602', 'B603', 'B604', 'B605', 'B606', 'B607', 'B608',
        'B609', 'B610', 'B701', 'B702', 'B703'
      ],
      severity: 'medium',
      confidence: 'medium'
    };
  }

  /**
   * 分析JavaScript代码
   */
  async analyzeJavaScript(code, filename = 'code.js') {
    const results = {
      filename,
      language: 'javascript',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      // 内置模式检测
      const patterns = this._getJavaScriptPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      // 尝试运行ESLint（如果可用）
      if (this._isESLintAvailable()) {
        const eslintResults = await this._runESLint(code, filename);
        results.errors.push(...eslintResults.errors);
        results.warnings.push(...eslintResults.warnings);
      }

      // 计算分数和风险等级
      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析Python代码
   */
  async analyzePython(code, filename = 'code.py') {
    const results = {
      filename,
      language: 'python',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      // 内置模式检测
      const patterns = this._getPythonPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      // 尝试运行Bandit（如果可用）
      if (this._isBanditAvailable()) {
        const banditResults = await this._runBandit(code, filename);
        results.errors.push(...banditResults.errors);
        results.warnings.push(...banditResults.warnings);
      }

      // 计算分数和风险等级
      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析Shell脚本
   */
  async analyzeShell(code, filename = 'script.sh') {
    const results = {
      filename,
      language: 'shell',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      const patterns = this._getShellPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析Java代码
   */
  async analyzeJava(code, filename = 'code.java') {
    const results = {
      filename,
      language: 'java',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      const patterns = this._getJavaPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析Go代码
   */
  async analyzeGo(code, filename = 'code.go') {
    const results = {
      filename,
      language: 'go',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      const patterns = this._getGoPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析Rust代码
   */
  async analyzeRust(code, filename = 'code.rs') {
    const results = {
      filename,
      language: 'rust',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      const patterns = this._getRustPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 分析C++代码
   */
  async analyzeCpp(code, filename = 'code.cpp') {
    const results = {
      filename,
      language: 'cpp',
      errors: [],
      warnings: [],
      info: [],
      score: 100,
      riskLevel: 'low',
      suggestions: []
    };

    try {
      const patterns = this._getCppPatterns();
      const findings = this._detectPatterns(code, patterns);
      
      results.errors.push(...findings.errors);
      results.warnings.push(...findings.warnings);
      results.info.push(...findings.info);
      results.suggestions.push(...findings.suggestions);

      this._calculateScore(results);
      
    } catch (error) {
      results.errors.push({
        rule: 'ANALYSIS_ERROR',
        message: `Analysis failed: ${error.message}`,
        severity: 'error'
      });
    }

    return results;
  }

  /**
   * 获取JavaScript危险模式
   */
  _getJavaScriptPatterns() {
    return {
      errors: [
        {
          pattern: /eval\s*\(/gi,
          rule: 'NO_EVAL',
          message: '使用eval()存在代码注入风险',
          severity: 'error'
        },
        {
          pattern: /new\s+Function\s*\(/gi,
          rule: 'NO_DYNAMIC_FUNCTION',
          message: '使用new Function()存在代码注入风险',
          severity: 'error'
        },
        {
          pattern: /document\.write\s*\(/gi,
          rule: 'NO_DOCUMENT_WRITE',
          message: '使用document.write()存在XSS风险',
          severity: 'error'
        },
        {
          pattern: /innerHTML\s*=/gi,
          rule: 'NO_INNERHTML',
          message: '直接设置innerHTML存在XSS风险',
          severity: 'error'
        },
        {
          pattern: /require\s*\(\s*['"]child_process['"]\s*\)/gi,
          rule: 'CHILD_PROCESS',
          message: '使用child_process存在命令注入风险',
          severity: 'error'
        },
        {
          pattern: /\beval\b/gi,
          rule: 'NO_EVAL',
          message: '检测到eval函数，存在代码注入风险',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /console\.(log|warn|error|debug)/gi,
          rule: 'NO_CONSOLE',
          message: '生产代码不应包含console语句',
          severity: 'warning'
        },
        {
          pattern: /setTimeout\s*\(\s*['"][^'"]+['"]/gi,
          rule: 'NO_STRING_TIMEOUT',
          message: '使用字符串形式的setTimeout存在代码注入风险',
          severity: 'warning'
        },
        {
          pattern: /setInterval\s*\(\s*['"][^'"]+['"]/gi,
          rule: 'NO_STRING_INTERVAL',
          message: '使用字符串形式的setInterval存在代码注入风险',
          severity: 'warning'
        },
        {
          pattern: /document\.(location|URL)\s*=/gi,
          rule: 'NO_LOCATION_CHANGE',
          message: '直接修改location可能被用于钓鱼攻击',
          severity: 'warning'
        }
      ],
      info: [
        {
          pattern: /http:\/\//gi,
          rule: 'HTTP_URL',
          message: '建议使用HTTPS代替HTTP',
          severity: 'info'
        },
        {
          pattern: /Math\.random/gi,
          rule: 'WEAK_RANDOM',
          message: 'Math.random()不适用于安全敏感场景',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /var\s+/gi,
          rule: 'USE_LET_CONST',
          message: '建议使用let或const代替var',
          suggestion: '使用 let 或 const 声明变量'
        }
      ]
    };
  }

  /**
   * 获取Python危险模式
   */
  _getPythonPatterns() {
    return {
      errors: [
        {
          pattern: /\bexec\s*\(/gi,
          rule: 'NO_EXEC',
          message: '使用exec()存在代码注入风险',
          severity: 'error'
        },
        {
          pattern: /\beval\s*\(/gi,
          rule: 'NO_EVAL',
          message: '使用eval()存在代码注入风险',
          severity: 'error'
        },
        {
          pattern: /__import__\s*\(/gi,
          rule: 'NO_DYNAMIC_IMPORT',
          message: '使用__import__()存在安全风险',
          severity: 'error'
        },
        {
          pattern: /subprocess\.(call|run|Popen)\s*\(/gi,
          rule: 'SUBPROCESS_CALL',
          message: '使用subprocess存在命令注入风险，确保参数已验证',
          severity: 'error'
        },
        {
          pattern: /os\.system\s*\(/gi,
          rule: 'OS_SYSTEM',
          message: '使用os.system()存在命令注入风险',
          severity: 'error'
        },
        {
          pattern: /pickle\.loads?\s*\(/gi,
          rule: 'PICKLE_LOADS',
          message: '使用pickle反序列化存在安全风险',
          severity: 'error'
        },
        {
          pattern: /yaml\.load\s*\([^)]*\)/gi,
          rule: 'YAML_UNSAFE_LOAD',
          message: '使用yaml.load()存在安全风险，请使用yaml.safe_load()',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /open\s*\([^)]*['"]w['"]/gi,
          rule: 'FILE_WRITE',
          message: '文件写入操作需要验证路径安全性',
          severity: 'warning'
        },
        {
          pattern: /requests\.(get|post|put|delete)\s*\(/gi,
          rule: 'HTTP_REQUEST',
          message: 'HTTP请求需要验证目标URL',
          severity: 'warning'
        },
        {
          pattern: /tempfile\.(mkstemp|mkdtemp)/gi,
          rule: 'TEMP_FILE',
          message: '临时文件操作后应确保清理',
          severity: 'warning'
        }
      ],
      info: [
        {
          pattern: /print\s*\(/gi,
          rule: 'HAS_PRINT',
          message: '生产代码应使用logging代替print',
          severity: 'info'
        },
        {
          pattern: /except\s*:/gi,
          rule: 'BARE_EXCEPT',
          message: '避免使用裸except，应指定具体异常类型',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /import\s+\*/gi,
          rule: 'NO_WILDCARD_IMPORT',
          message: '避免使用from module import *',
          suggestion: '显式导入需要的函数/类'
        }
      ]
    };
  }

  /**
   * 获取Shell脚本危险模式
   */
  _getShellPatterns() {
    return {
      errors: [
        {
          pattern: /\brm\s+-rf\b/gi,
          rule: 'RECURSIVE_DELETE',
          message: '使用rm -rf存在危险，可能导致数据丢失',
          severity: 'error'
        },
        {
          pattern: /\bchmod\s+777\b/gi,
          rule: 'DANGEROUS_CHMOD',
          message: 'chmod 777授予过多权限',
          severity: 'error'
        },
        {
          pattern: /\bwget\s+.*\|\s*(ba)?sh/gi,
          rule: 'PIPE_TO_SHELL',
          message: '管道到shell存在代码注入风险',
          severity: 'error'
        },
        {
          pattern: /\bcurl\s+.*\|\s*(ba)?sh/gi,
          rule: 'PIPE_TO_SHELL',
          message: '管道到shell存在代码注入风险',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /\$\{[^}]*\}/gi,
          rule: 'VARIABLE_EXPANSION',
          message: '变量扩展需要确保值已验证',
          severity: 'warning'
        },
        {
          pattern: /\beval\s/gi,
          rule: 'NO_EVAL',
          message: '使用eval执行动态命令存在安全风险',
          severity: 'warning'
        }
      ],
      info: [],
      suggestions: []
    };
  }

  /**
   * 获取Java危险模式
   */
  _getJavaPatterns() {
    return {
      errors: [
        {
          pattern: /Runtime\.getRuntime\(\)\.exec/g,
          rule: 'RUNTIME_EXEC',
          message: '使用Runtime.exec()存在命令注入风险',
          severity: 'error'
        },
        {
          pattern: /ProcessBuilder/g,
          rule: 'PROCESS_BUILDER',
          message: '使用ProcessBuilder需要验证输入参数',
          severity: 'error'
        },
        {
          pattern: /ObjectInputStream/g,
          rule: 'UNSAFE_DESERIALIZATION',
          message: '使用ObjectInputStream反序列化存在安全风险',
          severity: 'error'
        },
        {
          pattern: /ScriptEngine/g,
          rule: 'SCRIPT_ENGINE',
          message: '使用ScriptEngine执行脚本存在注入风险',
          severity: 'error'
        },
        {
          pattern: /XMLReader|SAXParser|DocumentBuilder/g,
          rule: 'XML_PARSING',
          message: 'XML解析需要启用安全配置防止XXE攻击',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /System\.exit\s*\(/g,
          rule: 'SYSTEM_EXIT',
          message: '直接调用System.exit可能影响应用稳定性',
          severity: 'warning'
        },
        {
          pattern: /\bexec\s*\(\s*['"]/gi,
          rule: 'STRING_EXEC',
          message: '字符串形式的exec存在命令注入风险',
          severity: 'warning'
        },
        {
          pattern: /Thread\.sleep/g,
          rule: 'THREAD_SLEEP',
          message: 'Thread.sleep可能影响性能',
          severity: 'info'
        }
      ],
      info: [
        {
          pattern: /System\.out\.print/g,
          rule: 'SYSTEM_OUT',
          message: '生产代码应使用日志框架代替System.out',
          severity: 'info'
        },
        {
          pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
          rule: 'EMPTY_CATCH',
          message: '空catch块会隐藏异常',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /new\s+String\s*\(/g,
          rule: 'UNNECESSARY_STRING',
          message: '不必要的String对象创建',
          suggestion: '直接使用字符串字面量'
        }
      ]
    };
  }

  /**
   * 获取Go危险模式
   */
  _getGoPatterns() {
    return {
      errors: [
        {
          pattern: /os\.Exec\s*\(/g,
          rule: 'OS_EXEC',
          message: '使用os/exec存在命令注入风险',
          severity: 'error'
        },
        {
          pattern: /exec\.Command\s*\(/g,
          rule: 'EXEC_COMMAND',
          message: '使用exec.Command需要验证参数',
          severity: 'error'
        },
        {
          pattern: /unsafe\.Pointer/g,
          rule: 'UNSAFE_POINTER',
          message: '使用unsafe.Pointer绕过类型安全',
          severity: 'error'
        },
        {
          pattern: /syscall\./g,
          rule: 'SYSCALL',
          message: '直接系统调用需要谨慎使用',
          severity: 'error'
        },
        {
          pattern: /reflect\.ValueOf.*\.Interface\(\)/g,
          rule: 'REFLECT_UNSAFE',
          message: '反射获取接口值可能存在类型安全问题',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /panic\s*\(/g,
          rule: 'PANIC_USAGE',
          message: '使用panic可能影响程序稳定性',
          severity: 'warning'
        },
        {
          pattern: /os\.Remove\s*\(/g,
          rule: 'FILE_DELETE',
          message: '文件删除需要验证路径',
          severity: 'warning'
        },
        {
          pattern: /http\.Get\s*\(/g,
          rule: 'HTTP_GET',
          message: 'HTTP请求需要验证URL和超时设置',
          severity: 'warning'
        }
      ],
      info: [
        {
          pattern: /fmt\.Print/g,
          rule: 'FMT_PRINT',
          message: '生产代码应使用log包代替fmt.Print',
          severity: 'info'
        },
        {
          pattern: /_\s*=\s*/g,
          rule: 'BLANK_IDENTIFIER',
          message: '检查是否真的不需要返回值',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /if\s+err\s+!=\s+nil\s*\{\s*return\s+err\s*\}/g,
          rule: 'ERROR_HANDLING',
          message: '考虑添加更多上下文信息到错误',
          suggestion: '使用fmt.Errorf添加上下文'
        }
      ]
    };
  }

  /**
   * 获取Rust危险模式
   */
  _getRustPatterns() {
    return {
      errors: [
        {
          pattern: /unsafe\s*\{/g,
          rule: 'UNSAFE_BLOCK',
          message: 'unsafe代码块需要仔细审查',
          severity: 'error'
        },
        {
          pattern: /std::process::Command/g,
          rule: 'PROCESS_COMMAND',
          message: '使用Command执行外部程序需要验证参数',
          severity: 'error'
        },
        {
          pattern: /transmute\s*</g,
          rule: 'TRANSMUTE',
          message: 'transmute存在类型安全风险',
          severity: 'error'
        },
        {
          pattern: /raw\s+ptr/g,
          rule: 'RAW_POINTER',
          message: '原始指针使用需要在unsafe块中',
          severity: 'error'
        }
      ],
      warnings: [
        {
          pattern: /unwrap\s*\(\)/g,
          rule: 'UNWRAP_USAGE',
          message: 'unwrap()在错误时会panic，考虑使用expect或?操作符',
          severity: 'warning'
        },
        {
          pattern: /panic!\s*\(/g,
          rule: 'PANIC_MACRO',
          message: 'panic!宏会终止程序',
          severity: 'warning'
        },
        {
          pattern: /println!\s*\(/g,
          rule: 'PRINTLN_USAGE',
          message: '生产代码应使用日志宏',
          severity: 'info'
        }
      ],
      info: [
        {
          pattern: /dbg!\s*\(/g,
          rule: 'DBG_MACRO',
          message: 'dbg!宏应在发布前移除',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /Box::new\s*\(/g,
          rule: 'BOX_ALLOCATION',
          message: '考虑使用Rc/Arc进行共享所有权',
          suggestion: '根据使用场景选择合适的智能指针'
        }
      ]
    };
  }

  /**
   * 获取C++危险模式
   */
  _getCppPatterns() {
    return {
      errors: [
        {
          pattern: /\bsystem\s*\(/g,
          rule: 'SYSTEM_CALL',
          message: '使用system()存在命令注入风险',
          severity: 'error'
        },
        {
          pattern: /\bexec[vl]?\s*\(/g,
          rule: 'EXEC_CALL',
          message: 'exec系列函数需要验证参数',
          severity: 'error'
        },
        {
          pattern: /\bstrcpy\s*\(/g,
          rule: 'STRCPY',
          message: 'strcpy存在缓冲区溢出风险，使用strncpy或std::string',
          severity: 'error'
        },
        {
          pattern: /\bstrcat\s*\(/g,
          rule: 'STRCAT',
          message: 'strcat存在缓冲区溢出风险，使用strncat或std::string',
          severity: 'error'
        },
        {
          pattern: /\bsprintf\s*\(/g,
          rule: 'SPRINTF',
          message: 'sprintf存在缓冲区溢出风险，使用snprintf',
          severity: 'error'
        },
        {
          pattern: /\bgets\s*\(/g,
          rule: 'GETS',
          message: 'gets已废弃且不安全，使用fgets或std::getline',
          severity: 'error'
        },
        {
          pattern: /\bmalloc\s*\(/g,
          rule: 'MALLOC',
          message: '手动内存管理，考虑使用智能指针',
          severity: 'warning'
        },
        {
          pattern: /\bfree\s*\(/g,
          rule: 'FREE',
          message: '手动内存释放，考虑使用智能指针',
          severity: 'warning'
        }
      ],
      warnings: [
        {
          pattern: /\bnew\s+/g,
          rule: 'RAW_NEW',
          message: '使用new分配内存，考虑使用智能指针',
          severity: 'warning'
        },
        {
          pattern: /\bdelete\s+/g,
          rule: 'RAW_DELETE',
          message: '使用delete释放内存，考虑使用智能指针',
          severity: 'warning'
        },
        {
          pattern: /\breinterpret_cast\s*</g,
          rule: 'REINTERPRET_CAST',
          message: 'reinterpret_cast存在类型安全风险',
          severity: 'warning'
        },
        {
          pattern: /\bconst_cast\s*</g,
          rule: 'CONST_CAST',
          message: 'const_cast可能破坏const语义',
          severity: 'warning'
        }
      ],
      info: [
        {
          pattern: /std::cout|printf/g,
          rule: 'IO_OPERATIONS',
          message: '生产代码考虑使用日志库',
          severity: 'info'
        },
        {
          pattern: /#include\s*<iostream>/g,
          rule: 'IOSTREAM_INCLUDE',
          message: 'iostream增加编译时间，考虑选择性包含',
          severity: 'info'
        }
      ],
      suggestions: [
        {
          pattern: /\bvector\s*</g,
          rule: 'USE_SMART_PTR',
          message: '对于动态数组，考虑使用std::vector',
          suggestion: '使用std::vector代替原始数组'
        },
        {
          pattern: /\bstring\s+/g,
          rule: 'USE_STRING',
          message: '对于字符串操作，优先使用std::string',
          suggestion: '避免使用C风格字符串'
        }
      ]
    };
  }

  /**
   * 检测代码模式
   */
  _detectPatterns(code, patterns) {
    const results = { errors: [], warnings: [], info: [], suggestions: [] };
    const lines = code.split('\n');

    for (const [severity, rules] of Object.entries(patterns)) {
      for (const rule of rules) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matches = line.match(rule.pattern);
          
          if (matches) {
            results[severity].push({
              rule: rule.rule,
              message: rule.message,
              severity: rule.severity || severity,
              line: i + 1,
              column: line.indexOf(matches[0]) + 1,
              snippet: line.trim().slice(0, 100),
              suggestion: rule.suggestion || null
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * 计算安全分数
   */
  _calculateScore(results) {
    let score = 100;

    // 扣分规则
    score -= results.errors.length * 15;
    score -= results.warnings.length * 5;
    score -= results.info.length * 1;

    // 最低分0
    score = Math.max(0, score);
    results.score = score;

    // 确定风险等级
    if (score < 50) {
      results.riskLevel = 'high';
    } else if (score < 70) {
      results.riskLevel = 'medium';
    } else if (score < 85) {
      results.riskLevel = 'low';
    } else {
      results.riskLevel = 'minimal';
    }
  }

  /**
   * 检查ESLint是否可用
   */
  _isESLintAvailable() {
    try {
      execSync('eslint --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查Bandit是否可用
   */
  _isBanditAvailable() {
    try {
      execSync('bandit --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 运行ESLint
   */
  async _runESLint(code, filename) {
    const results = { errors: [], warnings: [] };
    
    try {
      const tempFile = path.join(this.tempDir, filename);
      fs.writeFileSync(tempFile, code, 'utf8');
      
      const configPath = path.join(this.tempDir, '.eslintrc.json');
      fs.writeFileSync(configPath, JSON.stringify(this.eslintConfig), 'utf8');
      
      const output = execSync(`eslint -f json --config "${configPath}" "${tempFile}"`, {
        encoding: 'utf8',
        timeout: 30000
      });
      
      const eslintResults = JSON.parse(output);
      
      for (const fileResult of eslintResults) {
        for (const message of fileResult.messages) {
          const result = {
            rule: message.ruleId || 'ESLINT',
            message: message.message,
            severity: message.severity === 2 ? 'error' : 'warning',
            line: message.line,
            column: message.column
          };
          
          if (message.severity === 2) {
            results.errors.push(result);
          } else {
            results.warnings.push(result);
          }
        }
      }
      
      // 清理临时文件
      fs.unlinkSync(tempFile);
      fs.unlinkSync(configPath);
      
    } catch (error) {
      // ESLint可能返回非零退出码，忽略错误
    }
    
    return results;
  }

  /**
   * 运行Bandit
   */
  async _runBandit(code, filename) {
    const results = { errors: [], warnings: [] };
    
    try {
      const tempFile = path.join(this.tempDir, filename);
      fs.writeFileSync(tempFile, code, 'utf8');
      
      const output = execSync(`bandit -f json "${tempFile}"`, {
        encoding: 'utf8',
        timeout: 30000
      });
      
      const banditResults = JSON.parse(output);
      
      for (const result of banditResults.results || []) {
        const finding = {
          rule: result.test_id || 'BANDIT',
          message: result.issue_text,
          severity: result.issue_severity === 'HIGH' ? 'error' : 'warning',
          line: result.line_number,
          confidence: result.issue_confidence
        };
        
        if (result.issue_severity === 'HIGH') {
          results.errors.push(finding);
        } else {
          results.warnings.push(finding);
        }
      }
      
      // 清理临时文件
      fs.unlinkSync(tempFile);
      
    } catch (error) {
      // Bandit可能返回非零退出码，忽略错误
    }
    
    return results;
  }

  /**
   * 分析技能包
   */
  async analyzeSkillPackage(skillPath) {
    const report = {
      skillPath,
      files: [],
      overallScore: 100,
      riskLevel: 'low',
      summary: {
        filesAnalyzed: 0,
        totalErrors: 0,
        totalWarnings: 0,
        totalInfo: 0
      }
    };

    try {
      const files = fs.readdirSync(skillPath);
      
      for (const file of files) {
        const filePath = path.join(skillPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          const code = fs.readFileSync(filePath, 'utf8');
          
          let analysis = null;
          
          switch (ext) {
            case '.js':
            case '.ts':
            case '.jsx':
            case '.tsx':
              analysis = await this.analyzeJavaScript(code, file);
              break;
            case '.py':
            case '.pyw':
              analysis = await this.analyzePython(code, file);
              break;
            case '.sh':
            case '.bash':
              analysis = await this.analyzeShell(code, file);
              break;
            case '.java':
              analysis = await this.analyzeJava(code, file);
              break;
            case '.go':
              analysis = await this.analyzeGo(code, file);
              break;
            case '.rs':
              analysis = await this.analyzeRust(code, file);
              break;
            case '.cpp':
            case '.cc':
            case '.cxx':
            case '.c++':
            case '.h':
            case '.hpp':
              analysis = await this.analyzeCpp(code, file);
              break;
            case '.c':
              // C代码使用C++分析器的一部分
              analysis = await this.analyzeCpp(code, file);
              break;
          }
          
          if (analysis) {
            report.files.push(analysis);
            report.summary.filesAnalyzed++;
            report.summary.totalErrors += analysis.errors.length;
            report.summary.totalWarnings += analysis.warnings.length;
            report.summary.totalInfo += analysis.info.length;
          }
        }
      }

      // 计算总体分数（取最低分）
      if (report.files.length > 0) {
        report.overallScore = Math.min(...report.files.map(f => f.score));
        
        if (report.overallScore < 50) {
          report.riskLevel = 'high';
        } else if (report.overallScore < 70) {
          report.riskLevel = 'medium';
        } else if (report.overallScore < 85) {
          report.riskLevel = 'low';
        } else {
          report.riskLevel = 'minimal';
        }
      }

    } catch (error) {
      report.error = error.message;
    }

    return report;
  }
}

module.exports = { StaticAnalyzer };
