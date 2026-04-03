/**
 * SkillRenderer Integration Tests
 * Tests for the consolidated SkillRenderer skill
 */

const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== SkillRenderer Integration Tests ===\n');

  await test('Template: listTemplates should return array', async () => {
    const response = await fetch(`${BASE_URL}/api/templates`);
    const data = await response.json();
    assert(Array.isArray(data.templates), 'Should return templates array');
    console.log(`    Found ${data.total} templates`);
  });

  await test('Template: get weekly-report template', async () => {
    const response = await fetch(`${BASE_URL}/api/templates/weekly-report`);
    const data = await response.json();
    assert(data.id === 'weekly-report', 'Should return weekly-report');
    assert(Array.isArray(data.fields), 'Should have fields');
    console.log(`    Template: ${data.name}`);
  });

  await test('Template: render weekly-report with data', async () => {
    const response = await fetch(`${BASE_URL}/api/templates/weekly-report/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week: '2026-W12',
        author: 'Test User',
        completedTasks: '- 完成功能A\n- 完成功能B',
        nextWeekPlan: '- 开发功能C'
      })
    });
    const data = await response.json();
    assert(data.content.includes('2026-W12'), 'Should include week');
    assert(data.content.includes('Test User'), 'Should include author');
    console.log(`    Rendered ${data.content.length} chars`);
  });

  await test('Template: validate required fields', async () => {
    const response = await fetch(`${BASE_URL}/api/templates/weekly-report/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: '2026-W12' })
    });
    const data = await response.json();
    assert(!data.valid, 'Should be invalid without required fields');
    assert(data.errors.length > 0, 'Should have validation errors');
    console.log(`    Found ${data.errors.length} validation errors`);
  });

  await test('Preview: create text preview', async () => {
    const response = await fetch(`${BASE_URL}/api/skills/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'function test() { return true; }',
        filename: 'test.js',
        type: 'text'
      })
    });
    const data = await response.json();
    assert(data.id, 'Should return preview id');
    assert(data.url, 'Should return preview url');
    console.log(`    Preview: ${data.id}`);
  });

  await test('Security: XSS prevention in templates', async () => {
    const response = await fetch(`${BASE_URL}/api/templates/weekly-report/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week: '<script>alert("xss")</script>',
        author: 'Test',
        completedTasks: 'Test',
        nextWeekPlan: 'Test'
      })
    });
    const data = await response.json();
    assert(!data.content.includes('<script>'), 'Should escape script tags');
    console.log(`    XSS prevented: ${!data.content.includes('<script>')}`);
  });

  await test('Security: prototype pollution prevention', async () => {
    const response = await fetch(`${BASE_URL}/api/templates/custom/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        __proto__: { admin: true },
        name: 'Hacked'
      })
    });
    const data = await response.json();
    assert(data.error || data.id !== 'custom' || !data.admin, 'Should prevent prototype pollution');
    console.log(`    Prototype pollution blocked`);
  });

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All SkillRenderer tests passed!');
  }
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
