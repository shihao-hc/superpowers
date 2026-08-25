const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';

try {
    const content = fs.readFileSync(path, 'utf8');

    console.log('🔍 === v1-v9 核心基石验证 ===\n');

    // 1. 检查基础组件的类定义
    const components = ['MetaCognition', 'Thinking', 'Evolution', 'ToolManager', 'ReverseThinking', 'LessonLibrary'];
    console.log('📦 核心组件类定义:');
    components.forEach(comp => {
        const exists = content.includes(`class ${comp}`) || content.includes(`require('./${comp}')`);
        console.log(`  ${exists ? '✅' : '❌'} ${comp}`);
    });

    // 2. 检查 BrainSystem 构造函数中是否实例化了这些基础组件
    // 查找 constructor(...) { ... } 块
    const ctorStart = content.indexOf('constructor(');
    // 查找构造函数结束的大括号 (简单匹配)
    let braceCount = 0;
    let ctorBody = '';
    let inCtor = false;
    
    // 粗略扫描构造函数区域
    for (let i = ctorStart; i < ctorStart + 2000 && i < content.length; i++) {
        if (content[i] === '{') { braceCount++; inCtor = true; }
        if (inCtor) ctorBody += content[i];
        if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) break;
        }
    }

    console.log('\n🏗️ 构造函数实例化检查:');
    const instances = ['new MetaCognition', 'new Thinking', 'new Evolution', 'new ToolManager', 'new ReverseThinking'];
    instances.forEach(inst => {
        const used = ctorBody.includes(inst);
        console.log(`  ${used ? '✅' : '❌'} ${inst}`);
    });

    // 3. 检查 v1-v9 的遗留方法是否存在
    console.log('\n🕰️ v1-v9 历史方法兼容性:');
    const legacyMethods = [
        'perceive', 'think', 'act', 'reflect', // v1-v4
        'learn', 'evolve', // v5-v6
        'remember', 'recall', // v7
        'useTool', 'execute'  // v8-v9
    ];
    legacyMethods.forEach(m => {
        const exists = content.includes(m) && content.includes(`${m}(`);
        console.log(`  ${exists ? '✅' : '⚠️'} ${m}`);
    });

} catch (e) {
    console.error('分析失败:', e.message);
}
