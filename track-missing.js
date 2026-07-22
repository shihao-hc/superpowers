const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';
const content = fs.readFileSync(path, 'utf8');

const missingModules = [
    'verifyCall', 'proactiveThink', 'predict', 
    'learnInteraction', 'smartStore', 'autoPersist', 
    'unifiedProcess', 'getFullStatus', 'coreReflection', 
    'agiThink', 'whoAmI'
];

console.log('🔍 === 缺失模块深度追踪 ===\n');

missingModules.forEach(mod => {
    // 查找定义位置
    if (content.includes('BrainSystem.' + mod)) {
        console.log(`✅ ${mod}: 代码存在 (仅未导出)`);
    } else {
        console.log(`❌ ${mod}: 代码已丢失`);
    }
});
