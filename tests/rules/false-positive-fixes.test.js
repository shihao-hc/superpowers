const { runRule } = require('./helpers/testRule');

describe('RULE 39 — DUPLICATE_OBJECT_KEY (object-boundary + template-string aware)', () => {
  it('detects a real duplicate key in the same object', () => {
    const src = `const config = {
      host: 'localhost',
      port: 5432,
      host: '10.0.0.1'
    };`;
    const results = runRule(src, 'DUPLICATE_OBJECT_KEY');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].detail).toContain('host');
  });

  it('does NOT flag identical keys in sibling objects', () => {
    const src = `const a = { name: 'x', type: 'string' };
      const b = { name: 'y', type: 'object' };`;
    expect(runRule(src, 'DUPLICATE_OBJECT_KEY')).toEqual([]);
  });

  it('does NOT flag keys inside a template string (YAML/SQL blocks)', () => {
    const src = `const doc = \`\`\`yaml
name: \${name}
version: 1.0.0
inputs:
  - name: input
    type: string
    required: true
outputs:
  - name: result
    type: object
\`\`\`;`;
    expect(runRule(src, 'DUPLICATE_OBJECT_KEY')).toEqual([]);
  });

  it('does NOT flag keys in separate nested objects', () => {
    const src = `const nested = {
      total: 10,
      items: [
        { total: 1 },
        { total: 2 }
      ]
    };`;
    expect(runRule(src, 'DUPLICATE_OBJECT_KEY')).toEqual([]);
  });
});

describe('RULE 47 — SENSITIVE_HEADER_EXPOSED (router + helmet aware)', () => {
  it('flags an Express app that does not disable x-powered-by', () => {
    const src = `const express = require('express');
      const app = express();
      app.use(express.json());
      app.listen(3000);`;
    expect(runRule(src, 'SENSITIVE_HEADER_EXPOSED', 'app.js').length).toBeGreaterThan(0);
  });

  it('does NOT flag an Express Router file', () => {
    const src = `const express = require('express');
      const router = express.Router();
      router.get('/', (req, res) => res.send('ok'));
      module.exports = router;`;
    expect(runRule(src, 'SENSITIVE_HEADER_EXPOSED', 'routes/api.js')).toEqual([]);
  });

  it('does NOT flag an app that disables x-powered-by', () => {
    const src = `const express = require('express');
      const app = express();
      app.disable('x-powered-by');
      app.listen(3000);`;
    expect(runRule(src, 'SENSITIVE_HEADER_EXPOSED', 'app.js')).toEqual([]);
  });

  it('does NOT flag an app using helmet (default hidePoweredBy)', () => {
    const src = `const express = require('express');
      const helmet = require('helmet');
      const app = express();
      app.use(helmet());
      app.listen(3000);`;
    expect(runRule(src, 'SENSITIVE_HEADER_EXPOSED', 'app.js')).toEqual([]);
  });
});

describe('RULE 50 — TRUST_PROXY_MISSING (router aware)', () => {
  it('flags an Express app without trust proxy', () => {
    const src = `const express = require('express');
      const app = express();
      app.listen(3000);`;
    expect(runRule(src, 'TRUST_PROXY_MISSING', 'app.js').length).toBeGreaterThan(0);
  });

  it('does NOT flag an Express Router file', () => {
    const src = `const express = require('express');
      const router = express.Router();
      router.post('/', (req, res) => res.json({}));
      module.exports = router;`;
    expect(runRule(src, 'TRUST_PROXY_MISSING', 'routes/auth.js')).toEqual([]);
  });

  it('does NOT flag an app that sets trust proxy', () => {
    const src = `const express = require('express');
      const app = express();
      app.set('trust proxy', 1);
      app.listen(3000);`;
    expect(runRule(src, 'TRUST_PROXY_MISSING', 'app.js')).toEqual([]);
  });
});

describe('RULE 36 — TODO_COMMENT (template-string aware)', () => {
  it('flags a real TODO comment', () => {
    const src = `const x = 1;
      // TODO: fix this
      const y = 2;`;
    expect(runRule(src, 'TODO_COMMENT').length).toBeGreaterThan(0);
  });

  it('does NOT flag TODO inside a template string', () => {
    const src = 'const doc = `\n// TODO: example skill logic\nline\n`;';
    expect(runRule(src, 'TODO_COMMENT')).toEqual([]);
  });

  it('does NOT flag TODO in template string with closing-backtick-on-next-line (opens/closes inline)', () => {
    const src = 'const a = `one`;\nconst b = `\n// TODO: template content\n`;';
    expect(runRule(src, 'TODO_COMMENT')).toEqual([]);
  });
});

describe('RULE 40 — LARGE_FILE (diagnostic scripts excluded)', () => {
  it('flags a large business module', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    expect(runRule(lines.join('\n'), 'LARGE_FILE', 'src/workflow/Engine.js').length).toBeGreaterThan(0);
  });

  it('does NOT flag large diagnostic script', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    expect(runRule(lines.join('\n'), 'LARGE_FILE', 'src/learnEvalFinal.js')).toEqual([]);
  });
});

describe('RULE 41 — SYNCHRONOUS_IO (root/diagnostic scripts excluded)', () => {
  const src = `const fs = require('fs');
    const data = fs.readFileSync('config.json', 'utf8');`;

  it('flags sync IO in business code', () => {
    expect(runRule(src, 'SYNCHRONOUS_IO', 'src/core/Loader.js').length).toBeGreaterThan(0);
  });

  it('does NOT flag sync IO in root tool script', () => {
    expect(runRule(src, 'SYNCHRONOUS_IO', 'brain-bridge.js')).toEqual([]);
  });

  it('does NOT flag sync IO in diagnostic script under src/', () => {
    expect(runRule(src, 'SYNCHRONOUS_IO', 'src/agent/brain-full-check.js')).toEqual([]);
  });

  it('does NOT flag sync IO in test/tools/scripts paths', () => {
    expect(runRule(src, 'SYNCHRONOUS_IO', 'tools/check.js')).toEqual([]);
    expect(runRule(src, 'SYNCHRONOUS_IO', 'scripts/build.js')).toEqual([]);
  });

  it('does NOT flag sync IO in comprehensiveChecks diagnostic implementations', () => {
    expect(runRule(src, 'SYNCHRONOUS_IO', 'src/agent/comprehensiveChecks/A-code.js')).toEqual([]);
    expect(runRule(src, 'SYNCHRONOUS_IO', 'src/agent/comprehensiveChecks/N-cleanliness.js')).toEqual([]);
  });
});

describe('RULE 49 — NODE_ENV_CHECK_MISSING (entry-only)', () => {
  it('flags a real server entry missing NODE_ENV check', () => {
    const src = `const express = require('express');
      const app = express();
      app.listen(3000);`;
    expect(runRule(src, 'NODE_ENV_CHECK_MISSING', 'server/index.js').length).toBeGreaterThan(0);
  });

  it('does NOT flag an entry that checks NODE_ENV', () => {
    const src = `if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
      const express = require('express');
      const app = express();
      app.listen(3000);`;
    expect(runRule(src, 'NODE_ENV_CHECK_MISSING', 'server/index.js')).toEqual([]);
  });

  it('does NOT flag a module-barrel index file', () => {
    expect(runRule('module.exports = { a: 1 };', 'NODE_ENV_CHECK_MISSING', 'src/agent/index.js')).toEqual([]);
    expect(runRule('module.exports = { db: {} };', 'NODE_ENV_CHECK_MISSING', 'config/index.js')).toEqual([]);
    expect(runRule('module.exports = {};', 'NODE_ENV_CHECK_MISSING', 'server/routes/index.js')).toEqual([]);
  });
});
