const path = require('path');
const fs = require('fs');

class MemoryPersistence {
  saveLongTermMemory(bs) {
    const memory = {
      timestamp: new Date().toISOString(),
      version: bs.getVersion().version,
      lessons: bs.lessonLibrary.getStats(),
      evolution: bs.evolution.getStats(),
      decisions: bs.state.decisionCount,
      keyInsights: this._extractKeyInsights(bs)
    };

    try {
      const memPath = path.join(process.cwd(), '.opencode', 'brain-memory.json');

      const dir = path.dirname(memPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(memPath, JSON.stringify(memory, null, 2));
      console.log('[BrainSystem] 长期记忆已保存');

      return { success: true, path: memPath };
    } catch (e) {
      console.log('[BrainSystem] 长期记忆保存失败:', e.message);
      return { success: false, error: e.message };
    }
  }

  loadLongTermMemory() {
    try {
      const memPath = path.join(process.cwd(), '.opencode', 'brain-memory.json');

      if (!fs.existsSync(memPath)) {
        return { found: false };
      }

      const memory = JSON.parse(fs.readFileSync(memPath, 'utf8'));
      console.log('[BrainSystem] 长期记忆已加载');

      return { found: true, memory };
    } catch (e) {
      return { found: false, error: e.message };
    }
  }

  _extractKeyInsights(bs) {
    const insights = [];

    const lessons = bs.lessonLibrary.search('', { limit: 10, type: 'success' });
    for (const lesson of lessons) {
      insights.push({
        type: 'lesson',
        content: lesson.lesson.substring(0, 100),
        source: lesson.source
      });
    }

    const metaHistory = bs.metaCognition.getHistory(3);
    if (metaHistory.length > 0) {
      insights.push({
        type: 'meta',
        content: `已完成 ${metaHistory.length} 次复盘`,
        source: 'metaCognition'
      });
    }

    return insights;
  }
}

module.exports = new MemoryPersistence();
