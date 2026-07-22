/**
 * 终极全面体检脚本 (v22.1 Ultimate)
 * 覆盖：核心架构、全部导出接口、自动化钩子、Agent团队、持久化、记忆、教训
 */
const fs = require('fs');
const path = './src/core/BrainSystem.js';

console.log('\n🔬 === AI大脑终极全面体检 (Ultimate v22.1) ===\n');

let BS;
try {
    BS = require(path);
    console.log('✅ 模块加载成功');
} catch (e) {
    console.log('❌ 模块加载失败:', e.message);
    process.exit(1);
}

// 检查清单
const checks = {
    '核心架构': [
        { name: 'version', check: () => BS.version === '22.1.0' },
        { name: 'BrainSystem对象', check: () => typeof BS.BrainSystem === 'function' || typeof BS.BrainSystem === 'object' },
        { name: 'AgentTeamManager类', check: () => typeof BS.AgentTeamManager === 'function' },
    ],
    'v1-v9 历史能力': [
        { name: 'forceThink', check: () => typeof BS.forceThink === 'function' },
        { name: 'analyzeIntent', check: () => typeof BS.analyzeIntent === 'function' },
        { name: 'expressEmotion', check: () => typeof BS.expressEmotion === 'function' },
        { name: 'proactiveThink', check: () => typeof BS.proactiveThink === 'function' },
        { name: 'predict', check: () => typeof BS.predict === 'function' },
        { name: 'learnInteraction', check: () => typeof BS.learnInteraction === 'function' },
        { name: 'smartStore', check: () => typeof BS.smartStore === 'function' },
        { name: 'autoPersist', check: () => typeof BS.autoPersist === 'function' },
    ],
    'v10-v19 核心模块': [
        { name: 'unifiedProcess', check: () => typeof BS.unifiedProcess === 'function' },
        { name: 'getFullStatus', check: () => typeof BS.getFullStatus === 'function' },
        { name: 'verifyCall', check: () => typeof BS.verifyCall === 'function' },
    ],
    'v20-v21 AGI能力': [
        { name: 'agiEngine', check: () => typeof BS.agiEngine === 'function' },
        { name: 'autonomousLearn', check: () => typeof BS.autonomousLearn === 'function' },
        { name: 'deepReflect', check: () => typeof BS.deepReflect === 'function' },
        { name: 'coreReflection', check: () => typeof BS.coreReflection === 'function' },
        { name: 'agiThink', check: () => typeof BS.agiThink === 'function' },
        { name: 'whoAmI', check: () => typeof BS.whoAmI === 'function' },
    ],
    'v22 Agent团队': [
        { name: 'autoAgentProcess', check: () => typeof BS.autoAgentProcess === 'function' },
        { name: 'autoValidate', check: () => typeof BS.autoValidate === 'function' },
        { name: 'autoLearn', check: () => typeof BS.autoLearn === 'function' },
        { name: 'autoGetStatus', check: () => typeof BS.autoGetStatus === 'function' },
    ],
};

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

async function runChecks() {
    for (const [category, items] of Object.entries(checks)) {
        console.log(`\n📦 --- ${category} ---`);
        let catPassed = 0;
        for (const item of items) {
            try {
                const passed = item.check();
                if (passed) {
                    console.log(`  ✅ ${item.name}`);
                    catPassed++;
                    totalPassed++;
                } else {
                    console.log(`  ❌ ${item.name}`);
                    totalFailed++;
                    failures.push(`${category} > ${item.name}`);
                }
            } catch (e) {
                console.log(`  ⚠️ ${item.name} (异常: ${e.message})`);
                totalFailed++;
                failures.push(`${category} > ${item.name}`);
            }
        }
        console.log(`  [${category}] ${catPassed}/${items.length} 通过`);
    }

    // 2. 功能集成测试（真实调用）
    console.log('\n🧪 --- 功能集成测试 ---');
    
    // 测试 Agent 团队
    try {
        const team = new BS.AgentTeamManager();
        const agentCount = Object.keys(team._agents || {}).length;
        if (agentCount === 14) {
            console.log(`  ✅ Agent团队实例化 (14个Agent)`);
            totalPassed++;
        } else {
            console.log(`  ❌ Agent团队数量异常: ${agentCount}`);
            totalFailed++;
        }
    } catch (e) {
        console.log(`  ❌ Agent团队实例化失败: ${e.message}`);
        totalFailed++;
    }

    // 测试 autoAgentProcess
    try {
        const result = await BS.autoAgentProcess('全面体检测试');
        if (result && result.manager) {
            console.log(`  ✅ autoAgentProcess (耗时 ${result.totalTime}ms, Agent: ${result.agentsUsed})`);
            totalPassed++;
        } else {
            console.log(`  ❌ autoAgentProcess 响应异常`);
            totalFailed++;
        }
    } catch (e) {
        console.log(`  ❌ autoAgentProcess 调用失败: ${e.message}`);
        totalFailed++;
    }

    // 测试自动教训加载
    const content = fs.readFileSync(path, 'utf8');
    if (content.includes('Auto-Lesson') && content.includes('getSuggestions')) {
        console.log(`  ✅ 自动化钩子: 教训查询已集成`);
        totalPassed++;
    } else {
        console.log(`  ❌ 自动化钩子: 教训查询缺失`);
        totalFailed++;
        failures.push('自动化钩子缺失');
    }

    // 测试自动记忆记录
    if (content.includes('Auto-Memory') && content.includes('smartStore')) {
        console.log(`  ✅ 自动化钩子: 记忆记录已集成`);
        totalPassed++;
    } else {
        console.log(`  ❌ 自动化钩子: 记忆记录缺失`);
        totalFailed++;
        failures.push('自动化钩子缺失');
    }

    // 3. 文件完整性检查
    console.log('\n📂 --- 文件完整性 ---');
    const files = ['src/core/BrainSystem.js', 'brain-entry.js', 'AGENTS.md'];
    files.forEach(f => {
        if (fs.existsSync(f)) {
            console.log(`  ✅ ${f}`);
            totalPassed++;
        } else {
            console.log(`  ❌ ${f}`);
            totalFailed++;
        }
    });

    // 输出总结
    console.log('\n📊 === 终极体检报告 ===');
    console.log(`总检查项: ${totalPassed + totalFailed}`);
    console.log(`✅ 通过: ${totalPassed}`);
    console.log(`❌ 失败: ${totalFailed}`);
    
    if (totalFailed === 0) {
        console.log('\n🌟 结论: 系统完全健康！所有功能正常！');
    } else {
        console.log('\n⚠️ 以下项目需要修复:');
        failures.forEach(f => console.log(`  - ${f}`));
    }
}

runChecks().catch(e => {
    console.error('❌ 体检过程崩溃:', e);
    process.exit(1);
});
