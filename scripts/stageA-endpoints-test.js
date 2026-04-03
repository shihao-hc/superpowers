// Stage A: Endpoint test for Skills API (minimal integration test)
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const { SkillsApi } = require('../src/skills/api');

class MockSkillLoader {
  constructor(){
    this._skill = { name: 'docx', description: 'DOCX skill', version: '1.0.0', inputs: [], outputs: [], scripts: [] };
  }
  loadAll(){ return [this._skill]; }
  loadSkill(name){ return this._skill; }
  getSkill(name){ return this._skill; }
}

class MockSkillManager {
  constructor(){ this._skills=[{name:'docx', description:'DOCX', version:'1.0.0', riskLevel:'low', inputs: [], outputs: []}]; }
  getAllSkills(){ return this._skills; }
  getSkillInfo(name){ return this._skills.find(s=>s.name===name) || null; }
  getSkill(name){ return this.getSkillInfo(name); }
  getAllSkillsPublic(){ return this._skills; }
}

(async () => {
  const app = express();
  app.use(bodyParser.json());
  const mockMgr = new MockSkillManager();
  const api = new SkillsApi(mockMgr);
  app.use('/api/skills', api.getRouter());

  const server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;
    function req(path, cb){
      http.get({hostname:'127.0.0.1', port, path, agent:false}, (res)=>{
        let data=''; res.on('data', chunk=>data+=chunk); res.on('end', ()=>cb(null, res, data));
      }).on('error', cb);
    }

    req('/api/skills', (err,res,data)=>{
      console.log('GET /api/skills =>', res.statusCode, data);
      server.close();
    });
  });
})();
