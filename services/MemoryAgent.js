class MemoryAgent {
  async queryMemory(type) {
    // Simulation: return a canned memory message based on type
    switch (type) {
      case 'weather':
        return '这是一条关于天气的记忆示例';
      case 'download':
        return '最近下载记录可供参考';
      case 'game_chat':
        return '最近一次游戏聊天记录';
      case 'game_health':
        return '最近一次游戏健康状态';
      default:
        return '记忆条目示例';
    }
  }
}

module.exports = new MemoryAgent();
