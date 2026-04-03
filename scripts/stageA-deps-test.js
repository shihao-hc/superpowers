// Stage A: test dependencies endpoint for a skill
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const { SkillsApi } = require('../src/skills/api');

class MockSkill {
  constructor(){
    this.name = 'docx';
    this.description = 'DOCX skill';
    this.version = '1.0.0';
    this.inputs = [];
    this.outputs = [];
    this.scripts = [];
    this.dependencies = ['python-docx==0.8.11'];
  }
}
class MockSkillManager {
  constructor(){ this.skill = new MockSkill(); }
  getAllSkills(){ return [this.skill]; }
  getSkillInfo(name){ return this.skill; }
  getSkill(name){ return this.skill; }
  getSkillAlias(name){ return name; }
}

(async () => {
  const app = express();
  app.use(bodyParser.json());
  const mockMgr = new MockSkillManager();
  const api = new SkillsApi(mockMgr);
  // Attach a minimal loader interface for dependencies endpoint
  api.skillLoader = {
    getSkill: (name) => mockMgr.getAllSkills()[0]
  };
  app.use('/api/skills', api.getRouter());

  const server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;
    http.get(`http://localhost:${port}/api/skills/docx/dependencies`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('GET /api/skills/docx/dependencies =>', res.statusCode, data);
        server.close();
      });
    }).on('error', (e) => {
      console.error('Error:', e.message);
      server.close();
    });
  });
})();
