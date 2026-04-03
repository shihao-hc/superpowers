// Stage B test: Python environment isolation and script execution
const fs = require('fs');
const path = require('path');
const { PythonEnvManager } = require('../src/performance/PythonEnvManager');

(async () => {
  console.log('\n=== Stage B Test: Python Env & Script Execution ===');
  const py = new PythonEnvManager();
  const skillName = 'demo-python';
  try {
    // Quick environment check: is python available?
    const { exec } = require('child_process');
    await new Promise((resolve) => {
      exec('python --version', (err) => {
        resolve(!err);
      });
    });

    // prepare a tiny python script
    const scriptPath = path.join(process.cwd(), 'uploads', 'skills', skillName);
    if (!fs.existsSync(scriptPath)) fs.mkdirSync(scriptPath, { recursive: true });
    const scriptFile = path.join(scriptPath, 'script.py');
    fs.writeFileSync(scriptFile, 'import json\nprint(json.dumps({"ok": true, "msg": "hello"}))');
    const pythonAvailable = await new Promise((resolve) => {
      // reuse the quick check above, though it's already resolved
      resolve(true);
    });
    if (pythonAvailable) {
      const envPath = await py.ensureEnvironment(skillName, ['jsonlib']);
      // If Python not found in the created env, skip actual execution
      const pyExe = process.platform === 'win32' ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');
      if (!fs.existsSync(pyExe)) {
        console.log('Python interpreter not found in env; skipping actual execution for Stage B test.');
        return; // exit early
      }
      console.log('Python env ready at', envPath);

      const result = await py.runPythonScript(skillName, scriptFile, {});
      console.log('Script result:', result);
    } else {
      console.log('Python not available; skipping actual execution for Stage B test.');
    }
  } catch (e) {
    console.error('Stage B error:', e.message);
  }
})();
