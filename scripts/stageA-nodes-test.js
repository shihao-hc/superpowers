// Stage A: Test /api/skills/:skillName/nodes using a minimal mock SkillLoader/SkillManager
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');

// Minimal mock Skill and Manager to feed SkillsApi
class MockSkill {
  constructor(){
    this.name = 'docx';
    this.description = 'DOCX skill';
    this.version = '1.0.0';
    this.inputs = [{ name: 'action', type: 'string', enum: ['create','read','edit'] }];
    this.outputs = [{ name: 'result', type: 'string' }];
    this.scripts = [];
  }
}
class MockSkillManager {
  constructor(){ this.skill = new MockSkill(); }
  getAllSkills(){ return [this.skill]; }
  getSkillInfo(name){ return this.skill; }
  getSkill(name){ return this.skill; }
  getSkillAlias(name){ return name; }
  getAllSkillsPublic(){ return [this.skill]; }
}

(async () => {
  const app = express();
  app.use(bodyParser.json());
  const mockMgr = new MockSkillManager();
  const { SkillsApi } = require('../src/skills/api');
  const api = new SkillsApi(mockMgr);
  // Attach a simple skillLoader compatible with node endpoint
  api.skillLoader = { getSkill: (name) => mockMgr.getAllSkills()[0] };
  app.use('/api/skills', api.getRouter());
  const server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;
    const to = `http://127.0.0.1:${port}`;
    require('http').get(`${to}/api/skills/docx/nodes`, (res) => {
      let data='';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('GET /api/skills/docx/nodes =>', res.statusCode, data);
        server.close();
      });
    }).on('error', (e) => {
      console.error('Error:', e.message);
      server.close();
    });
  });
})();
