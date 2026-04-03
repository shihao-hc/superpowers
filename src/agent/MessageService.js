/**
 * ShiHao Message Service
 * 基于 Claude Code 消息处理系统架构
 * 
 * Claude Code 特性:
 * - 多种消息类型: user, assistant, system, tool_use, tool_result, attachment
 * - 消息规范化: normalizeMessagesForAPI
 * - 附件生成: getAttachmentMessages
 * - 消息合并: mergeUserMessages
 */

const EventEmitter = require('events');

class MessageService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.messages = [];
    this.maxMessages = options.maxMessages || 1000;
    
    // Token 估算
    this.tokenEstimator = options.tokenEstimator || ((text) => Math.ceil((text || '').length / 4));
    
    // 消息 ID 生成器
    this.messageId = 0;
  }
  
  // 创建消息
  createMessage(type, content, metadata = {}) {
    const message = {
      type,
      content,
      timestamp: metadata.timestamp || Date.now(),
      uuid: metadata.uuid || this._generateUUID(),
      ...metadata
    };
    
    if (type === 'user') {
      message.isMeta = metadata.isMeta || false;
      message.isCompactSummary = metadata.isCompactSummary || false;
    }
    
    if (type === 'assistant') {
      message.stopReason = metadata.stopReason || null;
      message.usage = metadata.usage || null;
    }
    
    if (type === 'system') {
      message.level = metadata.level || 'info';
    }
    
    return message;
  }
  
  // 创建用户消息
  createUserMessage(content, options = {}) {
    return this.createMessage('user', content, {
      isMeta: options.isMeta || false,
      origin: options.origin || null,
      ...options
    });
  }
  
  // 创建 Assistant 消息
  createAssistantMessage(content, options = {}) {
    return this.createMessage('assistant', content, {
      stopReason: options.stopReason || null,
      usage: options.usage || null,
      ...options
    });
  }
  
  // 创建系统消息
  createSystemMessage(content, options = {}) {
    return this.createMessage('system', content, {
      level: options.level || 'info',
      ...options
    });
  }
  
  // 创建工具使用消息
  createToolUseMessage(name, input, options = {}) {
    return this.createMessage('tool_use', {
      name,
      input,
      id: options.id || this._generateUUID()
    }, options);
  }
  
  // 创建工具结果消息
  createToolResultMessage(toolUseId, content, options = {}) {
    return this.createMessage('tool_result', {
      tool_use_id: toolUseId,
      content,
      is_error: options.isError || false
    }, options);
  }
  
  // 创建附件消息
  createAttachmentMessage(attachment, options = {}) {
    return this.createMessage('attachment', attachment, {
      isMeta: options.isMeta || false,
      origin: options.origin || null,
      ...options
    });
  }
  
  // 添加消息
  addMessage(message) {
    this.messages.push(message);
    
    // 限制消息数量
    if (this.messages.length > this.maxMessages) {
      const removed = this.messages.shift();
      this.emit('messageRemoved', { message: removed });
    }
    
    this.emit('messageAdded', { message });
    return message;
  }
  
  // 获取消息
  getMessages() {
    return [...this.messages];
  }
  
  // 获取最后一条 Assistant 消息
  getLastAssistantMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === 'assistant') {
        return this.messages[i];
      }
    }
    return null;
  }
  
  // 获取最后一条用户消息
  getLastUserMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.type === 'user' && !msg.isMeta) {
        return msg;
      }
    }
    return null;
  }
  
  // 规范化消息用于 API
  normalizeForAPI() {
    return this.messages.map(msg => this._normalizeMessage(msg));
  }
  
  // 规范化单条消息
  _normalizeMessage(msg) {
    switch (msg.type) {
      case 'user':
        return {
          role: 'user',
          content: this._normalizeContent(msg.content)
        };
      
      case 'assistant':
        return {
          role: 'assistant',
          content: this._normalizeContent(msg.content),
          ...(msg.stopReason ? { stop_reason: msg.stopReason } : {}),
          ...(msg.usage ? { usage: msg.usage } : {})
        };
      
      case 'system':
        return {
          role: 'system',
          content: this._normalizeContent(msg.content)
        };
      
      case 'tool_use':
        return {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: msg.content.id,
            name: msg.content.name,
            input: msg.content.input
          }]
        };
      
      case 'tool_result':
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.content.tool_use_id,
            content: typeof msg.content.content === 'string' 
              ? msg.content.content 
              : msg.content.content.map(b => b.text).join('\n'),
            is_error: msg.content.is_error
          }]
        };
      
      default:
        return msg;
    }
  }
  
  // 规范化内容
  _normalizeContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content.map(block => {
        if (block.text) {
          return { type: 'text', text: block.text };
        }
        if (block.name) {
          return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
        }
        if (block.tool_use_id) {
          return { 
            type: 'tool_result', 
            tool_use_id: block.tool_use_id, 
            content: block.text || block.content,
            is_error: block.is_error
          };
        }
        return block;
      });
    }
    
    return content;
  }
  
  // 合并相邻用户消息
  mergeUserMessages() {
    const result = [];
    let lastUserMessage = null;
    
    for (const msg of this.messages) {
      if (msg.type === 'user' && !msg.isMeta) {
        if (lastUserMessage) {
          // 合并内容
          const content1 = Array.isArray(lastUserMessage.content) 
            ? lastUserMessage.content 
            : [{ type: 'text', text: lastUserMessage.content }];
          const content2 = Array.isArray(msg.content) 
            ? msg.content 
            : [{ type: 'text', text: msg.content }];
          
          lastUserMessage = {
            ...lastUserMessage,
            content: [...content1, ...content2]
          };
          
          result[result.length - 1] = lastUserMessage;
        } else {
          lastUserMessage = msg;
          result.push(msg);
        }
      } else {
        lastUserMessage = null;
        result.push(msg);
      }
    }
    
    this.messages = result;
    return result;
  }
  
  // 移除图片 (用于压缩)
  stripImages() {
    return this.messages.map(msg => {
      if (msg.type !== 'user') {
        return msg;
      }
      
      const content = msg.content;
      if (typeof content === 'string') {
        return msg;
      }
      
      // 移除图片块，保留文本
      const filtered = content.filter(block => 
        block.type !== 'image'
      );
      
      if (filtered.length === content.length) {
        return msg;
      }
      
      return {
        ...msg,
        content: filtered.length === 1 
          ? filtered[0].text 
          : filtered,
        _imagesRemoved: true
      };
    });
  }
  
  // 获取压缩边界后的消息
  getMessagesAfterBoundary() {
    const boundaryIndex = this.messages.findIndex(
      m => m.isCompactBoundary || 
           (m.type === 'system' && m.content?.includes('summarized'))
    );
    
    if (boundaryIndex === -1) {
      return [...this.messages];
    }
    
    return this.messages.slice(boundaryIndex + 1);
  }
  
  // 计算消息 token 数
  calculateTokens() {
    let total = 0;
    
    for (const msg of this.messages) {
      if (msg.content) {
        if (typeof msg.content === 'string') {
          total += this.tokenEstimator(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.text) {
              total += this.tokenEstimator(block.text);
            }
          }
        }
      }
    }
    
    return total;
  }
  
  // 清空消息
  clear() {
    const oldMessages = [...this.messages];
    this.messages = [];
    this.emit('cleared', { messages: oldMessages });
    return oldMessages;
  }
  
  // 获取用户消息文本
  getUserMessageText(msg) {
    if (!msg || msg.type !== 'user') return '';
    
    const content = msg.content;
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    }
    
    return '';
  }
  
  // 检查是否是思考消息
  isThinkingMessage(msg) {
    if (msg.type !== 'assistant') return false;
    
    const content = msg.content;
    if (!Array.isArray(content)) return false;
    
    return content.some(block => block.type === 'thinking');
  }
  
  // 生成 UUID
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // 导出消息
  export() {
    return {
      messages: this.messages,
      exportedAt: Date.now(),
      count: this.messages.length
    };
  }
  
  // 导入消息
  import(data) {
    if (data.messages) {
      this.messages = data.messages;
      this.emit('imported', { count: data.messages.length });
    }
  }
  
  // 获取统计
  getStats() {
    return {
      total: this.messages.length,
      byType: this.messages.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      }, {}),
      tokens: this.calculateTokens()
    };
  }
}

module.exports = { MessageService };
