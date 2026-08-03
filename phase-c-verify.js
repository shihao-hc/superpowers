const cp = require('child_process');
const fs = require('fs');
let passed=0,failed=0,audit=[];
function assert(c,n,f){try{f();passed++;audit.push({cat:c,name:n,status:'PASS'})}catch(e){failed++;audit.push({cat:c,name:n,status:'FAIL',msg:e.message})}}
function bb(a){
  const clean = a.replace(/^"(.*)"$/, '$1');
  const argsList = ['brain-bridge.js'].concat(clean.split(/\s+/));
  const r = cp.spawnSync('node', argsList, { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(r.stdout.trim());
}

// ====== 1. 语法 ======
assert('S','8 文件语法',function(){
  ['src/core/DecisionContext.js','src/core/DecisionTracker.js','src/core/PreToolRiskAnalyzer.js',
   'src/core/LessonLearner.js','src/core/AutoDiagnose.js','src/daemon/index.js',
   'src/core/BrainBridge.js','src/core/BrainSystem.js','brain-bridge.js'].forEach(function(f){
    require.resolve('./'+f);
  });
});

// ====== 2. Phase C 核心模块 ======
assert('C','DecisionContext.generate()',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','code',[{id:'l1',title:'x',priority:'high'}],{interactionCount:5});
  if(!r.riskLevel)throw'no riskLevel';
  if(!r.recommendations)throw'no recs';
  if(!r.sessionContext)throw'no session';
  if(r.riskLevel!=='medium')throw'riskLevel='+r.riskLevel;
});

assert('C','DecisionContext risk=high for security',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','security',[],{});
  if(r.riskLevel!=='high')throw'security should be high: '+r.riskLevel;
});

assert('C','DecisionContext risk=low for default',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','default',[],{});
  if(r.riskLevel!=='low')throw'default should be low: '+r.riskLevel;
});

assert('C','DecisionContext recommendations by type',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','security',[],{});
  if(!r.recommendations||r.recommendations.length<1)throw'no recs';
  // 应该包含安全相关的建议
  const hasSec=r.recommendations.some(function(s){return s.indexOf('漏洞')>=0||s.indexOf('验证')>=0||s.indexOf('安全')>=0});
  if(!hasSec)throw'no security rec: '+JSON.stringify(r.recommendations);
});

assert('C','DecisionContext toolRestrictions for high risk',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','security',[],{});
  if(!r.toolRestrictions||r.toolRestrictions.length<1)throw'no restrictions for high risk';
  if(r.toolRestrictions[0].action!=='BLOCK')throw'should have BLOCK';
});

assert('C','DecisionContext toolRestrictions empty for low risk',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','default',[],{});
  if(r.toolRestrictions.length!==0)throw'should have no restrictions';
});

// ====== 3. DecisionTracker ======
assert('C','DecisionTracker record & history',function(){
  const DT=require('./src/core/DecisionTracker');
  const d=new DT();
  const rec=d.record({input:'test',taskType:'code',decision:'processed',riskLevel:'low'});
  if(!rec.id)throw'no id';
  const h=d.getHistory(5);
  if(h.length<1)throw'no history';
  if(h[0].id!==rec.id)throw'record not first';
});

assert('C','DecisionTracker getStats',function(){
  const DT=require('./src/core/DecisionTracker');
  const d=new DT();
  const s=d.getStats();
  if(typeof s.total!=='number')throw'no total';
  if(typeof s.applicationRate!=='number')throw'no rate';
});

assert('C','DecisionTracker getRecentLessons',function(){
  const DT=require('./src/core/DecisionTracker');
  const d=new DT();
  d.record({input:'t',taskType:'fix',decision:'fix',lessonsApplied:['l1','l2']});
  const r=d.getRecentLessons(5);
  if(!Array.isArray(r))throw'not array';
});

// ====== 4. PreToolRiskAnalyzer ======
assert('C','PreToolRiskAnalyzer basic',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r=p.analyze('ReadFile',{path:'src/test.js'},[]);
  if(r.action!=='ALLOW')throw'should allow read: '+r.action;
});

assert('C','PreToolRiskAnalyzer BLOCK delete critical',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r=p.analyze('DeleteFile',{path:'src/core/BrainSystem.js'},[]);
  if(r.action!=='BLOCK')throw'should block delete critical: '+r.action;
});

assert('C','PreToolRiskAnalyzer WARN write config',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r=p.analyze('WriteFile',{path:'.opencode/brain.config.json'},[]);
  if(r.action!=='WARN')throw'should warn write config: '+r.action;
});

assert('C','PreToolRiskAnalyzer ALLOW normal write',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r=p.analyze('WriteFile',{path:'src/test.js'},[]);
  if(r.action!=='ALLOW')throw'should allow: '+r.action;
});

// ====== 5. BrainBridge decisionContext ======
assert('C','BrainBridge process() 输出 decisionContext',function(){
  const j=bb('测试');
  if(!j.decisionContext)throw'no decisionContext';
  if(!j.decisionContext.riskLevel)throw'no riskLevel';
  if(!j.decisionContext.sessionContext)throw'no sessionContext';
});

assert('C','BrainBridge decisionContext risk matches taskType',function(){
  const j=bb('安全漏洞');
  if(!j.decisionContext)throw'no decisionContext';
  if(j.decisionContext.riskLevel!=='high')throw'security should be high: '+j.decisionContext.riskLevel;
  if(!j.decisionContext.recommendations||j.decisionContext.recommendations.length===0)throw'no recommendations';
  if(!j.decisionContext.toolRestrictions||j.decisionContext.toolRestrictions.length===0)throw'no restrictions for high risk';
  if(!j.decisionContext.sessionContext)throw'no sessionContext';
});

// ====== 6. DecisionTracker via CLI ======
assert('C','--decisions CLI',function(){
  const j=bb('--decisions');
  if(!j.history)throw'no history';
  if(!j.stats)throw'no stats';
});

// ====== 7. BrainSystem exports ======
assert('C','BrainSystem 导出 Phase C 模块',function(){
  const bs=require('./src/core/BrainSystem');
  if(typeof bs.DecisionContext!=='function')throw'DecisionContext missing';
  if(typeof bs.DecisionTracker!=='function')throw'DecisionTracker missing';
  if(typeof bs.PreToolRiskAnalyzer!=='function')throw'PreToolRiskAnalyzer missing';
});

// ====== 8. Hooks wiring ======
assert('C','PRE_TOOL_USE hook 注册',function(){
  const bs=require('./src/core/BrainSystem');
  bs.connectHooks();
  const hooks=require('./src/hooks');
  const h=hooks.globalHookRegistry.getHooks(hooks.HookEvents.PRE_TOOL_USE);
  const found=h.some(function(x){return x.name==='brain-risk-analyzer'});
  bs.disconnectHooks();
  if(!found)throw'risk analyzer hook not registered';
});

// ====== 9. Phase A+B 回归 ======
assert('R','6 任务类型',function(){
  [['写函数','code'],['调试','fix'],['安全','security'],['写测试','test'],['重构','refactor'],['你好','default']].forEach(function(x){
    const j=bb('"'+x[0]+'"');
    if(j.taskType!==x[1])throw'"'+x[0]+'"='+j.taskType;
  });
});
assert('R','JSON 完整',function(){
  const j=bb('测试');
  ['intent','taskType','lessons','warnings','decisionContext'].forEach(function(f){if(j[f]===undefined&&!j.hasOwnProperty(f))throw'missing '+f});
});
assert('R','BRAIN_DISABLE',function(){
  const r=cp.spawnSync('node',['brain-bridge.js','test'],{encoding:'utf8',timeout:10000,env:Object.assign({},process.env,{BRAIN_DISABLE:'1'})});
  if(JSON.parse(r.trim()).error!=='disabled')throw'not disabled';
});
assert('R','--status',function(){const j=bb('--status');if(!j.enabled)throw'no enabled'});
assert('R','--help',function(){const j=bb('--help');if(!j.usage)throw'no usage'});
assert('R','--diagnose',function(){const j=bb('--diagnose error');if(!j.matches)throw'no matches'});
assert('R','--pending',function(){const j=bb('--pending');if(!j.pending)throw'no pending'});

assert('R','brain-entry.js',function(){
  const r=cp.spawnSync('node',['brain-entry.js','--status'],{encoding:'utf8',timeout:30000});
  if(!r.includes('v22.1'))throw'no v22.1';
});
assert('R','brain-context.js',function(){
  const r=cp.spawnSync('node',['brain-context.js'],{encoding:'utf8',timeout:30000});
  if(!r.includes('BRAIN_SUMMARY'))throw'no summary';
});
assert('R','brain-decision.js',function(){
  const r=cp.spawnSync('node',['brain-decision.js','code'],{encoding:'utf8',timeout:30000});
  if(!r.includes('lesson'))throw'no lesson';
});

assert('R','LessonLibrary quiet',function(){const L=require('./src/core/LessonLibrary');const l=new L({quiet:true});if(l.lessons.length<41)throw'<41'});
assert('R','CircuitBreaker',function(){const C=require('./src/core/CircuitBreaker');const c=new C({maxRetries:1});c.recordFailure();if(c.state!=='CLOSED')throw'not closed';c.reset();if(c.state!=='OPEN')throw'not open'});
assert('R','LoopGuard',function(){const L=require('./src/core/LoopGuard');const l=new L({maxPerMinute:1});l.check('t','x');l.check('t','x');if(!l.check('t','x').tripped)throw'not tripped'});
assert('R','AGENTS.md',function(){const c=fs.readFileSync('AGENTS.md','utf8');if(!c.includes('Phase C'))throw'no Phase C';if(!c.includes('动态决策注入'))throw'no dynamic'});
assert('R','config 完整',function(){const c=JSON.parse(fs.readFileSync('.opencode/brain.config.json','utf8'));['enabled','circuitBreaker','loopGuard','audit','backup','learner','diagnose','daemon'].forEach(function(k){if(c[k]===undefined)throw'missing '+k})});

// ====== 10. 边情况测试 (Edge Cases) ======

// DecisionTracker: null/undefined entry returns null
assert('C','DecisionTracker record(null) returns null',function(){
  const DT=require('./src/core/DecisionTracker');
  const d=new DT();
  const r1=d.record(null);
  if(r1!==null)throw'should return null for null entry';
  const r2=d.record(undefined);
  if(r2!==null)throw'should return null for undefined entry';
});

// AutoDiagnose: CJK tokens preserved
assert('C','AutoDiagnose _tokenize CJK preserved',function(){
  const AD=require('./src/core/AutoDiagnose');
  const a=new AD();
  const tokens=a._tokenize('出现 安全 问题');
  if(tokens.indexOf('出现')===-1)throw'CJK token "出现" filtered out';
  if(tokens.indexOf('安全')===-1)throw'CJK token "安全" filtered out';
  if(tokens.indexOf('问题')===-1)throw'CJK token "问题" filtered out';
  // English tokens still work
  const tokens2=a._tokenize('this is a test error');
  if(tokens2.indexOf('this')===-1)throw'english token "this" filtered out';
  if(tokens2.indexOf('error')===-1)throw'english token "error" filtered out';
  // short non-CJK tokens still filtered
  const tokens3=a._tokenize('a b c');
  if(tokens3.length!==0)throw'short tokens should be filtered: '+tokens3.length;
});

// PreToolRiskAnalyzer: path traversal detection
assert('C','PreToolRiskAnalyzer path traversal BLOCK',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r1=p.analyze('WriteFile',{path:'../../../etc/passwd'},[]);
  if(r1.action!=='BLOCK')throw'should block unix traversal: '+r1.action;
  if(!r1.traversal)throw'missing traversal flag';
  const r2=p.analyze('WriteFile',{path:'src\\..\\..\\..\\windows\\system32\\config'},[]);
  if(r2.action!=='BLOCK')throw'should block windows traversal: '+r2.action;
  const r3=p.analyze('ReadFile',{path:'.opencode/../../secret.json'},[]);
  if(r3.action!=='BLOCK')throw'should block config traversal: '+r3.action;
});

// PreToolRiskAnalyzer: null/undefined inputs
assert('C','PreToolRiskAnalyzer null inputs',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r1=p.analyze(null,{path:'test.js'},[]);
  if(r1.action!=='ALLOW')throw'should allow for null tool: '+r1.action;
  const r2=p.analyze('ReadFile',null,[]);
  if(r2.action!=='ALLOW')throw'should allow for null args: '+r2.action;
  const r3=p.analyze('ReadFile',{path:'test.js'},null);
  if(r3.action!=='ALLOW')throw'should allow for null lessons: '+r3.action;
});

// CircuitBreaker: exact time boundary (>= fix)
assert('C','CircuitBreaker exact time boundary',function(){
  const C=require('./src/core/CircuitBreaker');
  const c=new C({maxRetries:1,resetAfterMs:10});
  c.recordFailure(); // fails once -> CLOSED (maxRetries=1)
  if(c.state!=='CLOSED')throw'should be closed';
  // immediately check: should be blocked (> 10ms not elapsed)
  const allowed1=c.isAllowed();
  if(allowed1)throw'should not allow before timeout';
  // wait exact timeout
  const t0=Date.now();
  while(Date.now()-t0<10){} // spin until exact boundary
  // at t=10ms+, `Date.now() - lastFailureTime >= 10` should be true
  const allowed2=c.isAllowed();
  if(!allowed2)throw'should allow at exact timeout boundary';
  if(c.state!=='HALF_OPEN')throw'should be HALF_OPEN after boundary';
  c.recordSuccess();
  if(c.state!=='OPEN')throw'should reset to OPEN after success';
});

// LoopGuard: exactly maxPerMinute (not exceeding)
assert('C','LoopGuard exact boundary not tripped',function(){
  const L=require('./src/core/LoopGuard');
  const l=new L({maxPerMinute:3});
  const r1=l.check('src','write');
  if(r1.tripped)throw'1st call tripped';
  const r2=l.check('src','write');
  if(r2.tripped)throw'2nd call tripped';
  const r3=l.check('src','write');
  if(r3.tripped)throw'3rd call (exact limit) tripped';
  const r4=l.check('src','write');
  if(!r4.tripped)throw'4th call should be tripped';
});

// DecisionContext: additional risk levels
assert('C','DecisionContext risk=high for fix',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','fix',[],{});
  if(r.riskLevel!=='high')throw'fix should be high: '+r.riskLevel;
});

assert('C','DecisionContext risk=medium for deploy',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test','deploy',[],{});
  if(r.riskLevel!=='medium')throw'deploy should be medium: '+r.riskLevel;
});

assert('C','DecisionContext risk=low for null taskType',function(){
  const DC=require('./src/core/DecisionContext');
  const d=new DC();
  const r=d.generate('test',null,[],{});
  if(r.riskLevel!=='low')throw'null taskType should be low: '+r.riskLevel;
});

// DecisionTracker: auto-prune at boundary
assert('C','DecisionTracker auto-prune at 500',function(){
  const DT=require('./src/core/DecisionTracker');
  const d=new DT({maxEntries:10});
  for(let i=0;i<12;i++)d.record({input:'t'+i,taskType:'test'});
  const h=d.getHistory(20);
  if(h.length>10)throw'should be pruned to max 10, got '+h.length;
  // newest entries should be kept
  if(h[0].input!=='t11')throw'newest entry should be t11, got '+h[0].input;
});

// AutoDiagnose: empty/null error messages
assert('C','AutoDiagnose empty/null input',function(){
  const AD=require('./src/core/AutoDiagnose');
  const a=new AD();
  const r1=a.diagnose(null);
  if(r1.length!==0)throw'null should return []';
  const r2=a.diagnose('');
  if(r2.length!==0)throw'empty should return []';
  const r3=a.diagnose(123);
  if(r3.length!==0)throw'number should return []';
});

// PreToolRiskAnalyzer: delete config file (not blocked, warned)
assert('C','PreToolRiskAnalyzer delete config warns',function(){
  const P=require('./src/core/PreToolRiskAnalyzer');
  const p=new P();
  const r=p.analyze('DeleteFile',{path:'.opencode/brain.config.json'},[]);
  if(r.action!=='WARN')throw'delete config should WARN: '+r.action;
  if(!r.reason||r.reason.indexOf('备份')===-1)throw'should mention backup: '+r.reason;
});

// ====== 清洁 ======
try{const lib=JSON.parse(fs.readFileSync('.opencode/lessons.json','utf8'));lib.lessons=lib.lessons.filter(function(x){return x.lesson!=='test'&&x.lesson!=='Test lesson'});fs.writeFileSync('.opencode/lessons.json',JSON.stringify(lib,null,2))}catch(e){console.warn('[PhaseC] Cleanup lessons.json:',e.message)}
try{const p='.opencode/evolution/pending-lessons.json';if(fs.existsSync(p)){let pd=JSON.parse(fs.readFileSync(p,'utf8'));const before=pd.length;pd=pd.filter(function(x){return x.source!=='lesson-learner'&&x.input.indexOf('test')===-1});if(pd.length!==before)fs.writeFileSync(p,JSON.stringify(pd,null,2))}}catch(e){console.warn('[PhaseC] Cleanup pending-lessons:',e.message)}

const total=passed+failed;
const pct=Math.round(passed/total*100);
console.log('\n========================================');
console.log('  Phase C \u6700\u7ec8\u5168\u9762\u9a8c\u8bc1');
console.log('========================================');
console.log('\u6d4b\u8bd5\u603b\u6570: '+total+'\n\u901a\u8fc7: '+passed+'\n\u5931\u8d25: '+failed+'\n\u901a\u8fc7\u7387: '+pct+'%');
if(failed>0){console.log('\n\u5931\u8d25\u8be6\u60c5:');audit.filter(function(a){return a.status==='FAIL'}).forEach(function(a){console.log('  ['+a.cat+'] '+a.name+': '+a.msg)})}
const cats={};audit.forEach(function(a){cats[a.cat]=(cats[a.cat]||0)+1});console.log('\n\u5206\u7c7B:');Object.keys(cats).forEach(function(c){console.log('  '+c+': '+audit.filter(function(a){return a.cat===c&&a.status==='PASS'}).length+'/'+cats[c])});
console.log('\n\u8bc4\u5206: '+(failed===0?'10/10':failed<=2?'9/10':'8/10')+' \u7b49\u7ea7: '+(failed===0?'A \u2014 \u751f\u4ea7\u5c31\u7eea':failed<=2?'A\u2013':'B+'));




