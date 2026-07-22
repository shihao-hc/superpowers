/**
 * ShiHao Message Service v2
 * 基于 Claude Code 消息处理系统架构
 *
 * Claude Code 特性:
 * - 多种消息类型: user, assistant, system, tool_use, tool_result, attachment
 * - 消息规范化: normalizeMessagesForAPI
 * - 附件生成: getAttachmentMessages
 * - 消息合并: mergeUserMessages
 *
 * v2 新增特性 (借鉴 Claude Code):
 * - BoundedUUIDSet: 环形缓冲区固定内存追踪，防止重复处理
 * - FlushGate: 初始消息防乱序屏障
 * - 命令队列批处理支持
 */

const EventEmitter = require('events');

/**
 * BoundedUUIDSet - FIFO-bounded set backed by a circular buffer
 *
 * 特性:
 * - O(1) 添加和查找
 * - 固定内存使用
 * - 自动驱逐最旧条目
 *
 * 用途:
 * - 追踪已处理的 UUID，防止重复
 * - 回声过滤 (WebSocket 回显检测)
 * - 消息去重
 */
class BoundedUUIDSet {
  constructor(capacity = 2000) {
    this.capacity = capacity;
    this.ring = new Array(capacity);
    this.set = new Set();
    this.writeIdx = 0;
  }

  /**
   * 添加 UUID 到集合
   * 如果已存在则忽略
   * 如果容量满则驱逐最旧条目
   */
  add(uuid) {
    if (this.set.has(uuid)) {return false;}

    // 驱逐最旧条目
    const evicted = this.ring[this.writeIdx];
    if (evicted !== undefined) {
      this.set.delete(evicted);
    }

    this.ring[this.writeIdx] = uuid;
    this.set.add(uuid);
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    return true;
  }

  /**
   * 检查 UUID 是否在集合中
   */
  has(uuid) {
    return this.set.has(uuid);
  }

  /**
   * 检查 UUID 是否已存在
   */
  contains(uuid) {
    return this.set.has(uuid);
  }

  /**
   * 清空集合
   */
  clear() {
    this.set.clear();
    this.ring.fill(undefined);
    this.writeIdx = 0;
  }

  /**
   * 获取集合大小
   */
  size() {
    return this.set.size;
  }

  /**
   * 获取容量
   */
  getCapacity() {
    return this.capacity;
  }

  /**
   * 检查是否为空
   */
  isEmpty() {
    return this.set.size === 0;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      capacity: this.capacity,
      size: this.set.size,
      utilization: `${(this.set.size / this.capacity * 100).toFixed(2)}%`
    };
  }
}

/**
 * FlushGate - 消息排序屏障
 *
 * 用途:
 * - 在初始历史消息发送期间阻止新消息
 * - 确保消息顺序正确
 *
 * 流程:
 * 1. enqueue() - 新消息加入队列
 * 2. flush() - 开始发送队列中的消息
 * 3. drain() - 队列消息全部发出
 */
class FlushGate {
  constructor() {
    this.queue = [];
    this.flushed = false;
    this._flushStartTime = null;
  }

  /**
   * 入队消息（如果尚未 flush）
   * @returns {boolean} true=已排队, false=已flush或队列已结束
   */
  enqueue(item) {
    if (this.flushed) {return false;}
    this.queue.push(item);
    return true;
  }

  /**
   * 检查是否已 flush
   */
  isFlushed() {
    return this.flushed;
  }

  /**
   * 开始 flush，开始发送队列中的消息
   * @returns {Array} 排队的消息
   */
  flush() {
    this.flushed = true;
    this._flushStartTime = Date.now();
    return this.queue.splice(0);
  }

  /**
   * 获取队列长度
   */
  length() {
    return this.queue.length;
  }

  /**
   * 重置 Gate，允许新消息直接通过
   */
  reset() {
    this.flushed = false;
    this.queue = [];
    this._flushStartTime = null;
  }

  /**
   * 丢弃所有排队消息（永久关闭）
   * @returns {number} 丢弃的消息数量
   */
  drop() {
    const count = this.queue.length;
    this.queue = [];
    this.flushed = true;
    this._flushStartTime = Date.now();
    return count;
  }

  /**
   * 获取 flush 耗时
   */
  getFlushDuration() {
    if (!this._flushStartTime) {return 0;}
    return Date.now() - this._flushStartTime;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      flushed: this.flushed,
      queueLength: this.queue.length,
      flushDuration: this.getFlushDuration(),
      active: !this.flushed && this.queue.length > 0
    };
  }
}

/**
 * CommandQueue - 命令批处理队列
 *
 * 特性:
 * - 合并连续同类型的命令
 * - 支持优先级
 * - 防重复
 */
class CommandQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this._lastProcessedType = null;
  }

  /**
   * 入队命令
   * @param {Object} command - 命令对象
   * @param {string} command.type - 命令类型 (prompt, task-notification, orphaned-permission)
   * @param {string} command.value - 命令内容
   * @param {Object} command.options - 命令选项
   */
  enqueue(command) {
    const last = this.queue[this.queue.length - 1];

    // 尝试合并连续命令
    if (last && this.canBatchWith(last, command)) {
      // 合并 value
      if (typeof last.value === 'string' && typeof command.value === 'string') {
        last.value = `${last.value}\n${command.value}`;
      } else if (Array.isArray(last.value) && Array.isArray(command.value)) {
        last.value = [...last.value, ...command.value];
      }
      // 用最后一个 uuid
      last.uuid = command.uuid || last.uuid;
      // 合并 metadata
      if (command.metadata) {
        last.metadata = { ...last.metadata, ...command.metadata };
      }
      return false; // 已合并，未新增
    }

    this.queue.push({
      ...command,
      enqueuedAt: Date.now()
    });
    return true; // 新增
  }

  /**
   * 检查两个命令是否可以合并
   */
  canBatchWith(a, b) {
    if (!a || !b) {return false;}
    return (
      a.type === b.type &&
      a.isMeta === b.isMeta &&
      a.workload === b.workload
    );
  }

  /**
   * 获取队列长度
   */
  length() {
    return this.queue.length;
  }

  /**
   * 查看队首但不取出
   */
  peek() {
    return this.queue[0] || null;
  }

  /**
   * 出队命令
   */
  dequeue() {
    return this.queue.shift() || null;
  }

  /**
   * 清空队列
   */
  clear() {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const byType = {};
    for (const cmd of this.queue) {
      byType[cmd.type] = (byType[cmd.type] || 0) + 1;
    }
    return {
      length: this.queue.length,
      byType,
      oldest: this.queue[0]?.enqueuedAt ? Date.now() - this.queue[0].enqueuedAt : 0
    };
  }
}

class MessageService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.messages = [];
    this.maxMessages = options.maxMessages || 1000;

    // Token 估算
    this.tokenEstimator = options.tokenEstimator || ((text) => Math.ceil((text || '').length / 4));

    // 消息 ID 生成器
    this.messageId = 0;

    // v2 新增: UUID 去重集合
    const uuidSetCapacity = options.uuidSetCapacity || 2000;
    this.processedUUIDs = new BoundedUUIDSet(uuidSetCapacity);

    // v2 新增: 消息 flush gate
    this.flushGate = new FlushGate();

    // v2 新增: 命令队列
    this.commandQueue = new CommandQueue();

    // v2 新增: 挂起的结果
    this.heldBackResult = null;

    // v2 新增: 已发送的 UUID（用于回声过滤）
    this.sentUUIDs = new BoundedUUIDSet(uuidSetCapacity);

    // v2 新增: 已确认的 UUID（服务器已处理）
    this.acknowledgedUUIDs = new BoundedUUIDSet(uuidSetCapacity);
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

  // 处理消息（兼容旧 API）
  async processMessage({ content, role = 'user', metadata = {} }) {
    const messageType = role === 'assistant' ? 'assistant' :
      role === 'system' ? 'system' : 'user';

    const message = this.createMessage(messageType, content, metadata);
    return this.addMessage(message);
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
    return this.messages.map((msg) => this._normalizeMessage(msg));
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
            : msg.content.content.map((b) => b.text).join('\n'),
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
      return content.map((block) => {
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
    return this.messages.map((msg) => {
      if (msg.type !== 'user') {
        return msg;
      }

      const content = msg.content;
      if (typeof content === 'string') {
        return msg;
      }

      // 移除图片块，保留文本
      const filtered = content.filter((block) =>
        block.type !== 'image'
      );

      if (filtered.length === content.length) {
        return msg;
      }

      return {
        ...msg,
        content: filtered.length === 1
          ? filtered[0]?.text ?? ''
          : filtered,
        _imagesRemoved: true
      };
    });
  }

  // 获取压缩边界后的消息
  getMessagesAfterBoundary() {
    const boundaryIndex = this.messages.findIndex(
      (m) => m.isCompactBoundary ||
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
    if (!msg || msg.type !== 'user') {return '';}

    const content = msg.content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }

    return '';
  }

  // 检查是否是思考消息
  isThinkingMessage(msg) {
    if (msg.type !== 'assistant') {return false;}

    const content = msg.content;
    if (!Array.isArray(content)) {return false;}

    return content.some((block) => block.type === 'thinking');
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

  // ========== v2 新增方法 ==========

  /**
   * 添加消息（增强版：支持 FlushGate）
   * @param {Object} message - 消息对象
   * @param {Object} options - 选项
   * @param {boolean} options.useFlushGate - 是否使用 FlushGate
   * @returns {Object|null} 如果被 flush gate 拦截则返回 null
   */
  addMessageEnhanced(message, options = {}) {
    const { useFlushGate = false } = options;

    // 如果启用了 flush gate，先检查
    if (useFlushGate && !this.flushGate.isFlushed()) {
      const queued = this.flushGate.enqueue(message);
      if (queued) {
        this.emit('messageQueued', { message, queueLength: this.flushGate.length() });
        return null; // 被 gate 拦截
      }
    }

    return this.addMessage(message);
  }

  /**
   * 检查 UUID 是否已处理（去重）
   */
  isProcessed(uuid) {
    return this.processedUUIDs.has(uuid);
  }

  /**
   * 标记 UUID 为已处理
   */
  markProcessed(uuid) {
    this.processedUUIDs.add(uuid);
  }

  /**
   * 检查消息是否已发送（回声过滤）
   */
  isSent(uuid) {
    return this.sentUUIDs.has(uuid);
  }

  /**
   * 标记消息已发送
   */
  markSent(uuid) {
    this.sentUUIDs.add(uuid);
  }

  /**
   * 检查消息是否已确认
   */
  isAcknowledged(uuid) {
    return this.acknowledgedUUIDs.has(uuid);
  }

  /**
   * 标记消息已确认
   */
  markAcknowledged(uuid) {
    this.acknowledgedUUIDs.add(uuid);
  }

  /**
   * 确认多个 UUID
   */
  acknowledgeBatch(uuids) {
    for (const uuid of uuids) {
      this.acknowledgedUUIDs.add(uuid);
    }
  }

  /**
   * 开始 flush 过程
   * @returns {Array} 排队的消息
   */
  beginFlush() {
    const pending = this.flushGate.flush();
    this.emit('flushBegan', {
      pendingCount: pending.length,
      duration: this.flushGate.getFlushDuration()
    });
    return pending;
  }

  /**
   * 重置 flush gate
   */
  resetFlushGate() {
    this.flushGate.reset();
    this.emit('flushGateReset');
  }

  /**
   * 获取 FlushGate 状态
   */
  getFlushGateStats() {
    return this.flushGate.getStats();
  }

  /**
   * 获取 UUID 集合统计
   */
  getUUIDSetStats() {
    return {
      processed: this.processedUUIDs.getStats(),
      sent: this.sentUUIDs.getStats(),
      acknowledged: this.acknowledgedUUIDs.getStats()
    };
  }

  /**
   * 清空所有 UUID 追踪
   */
  clearUUIDTracking() {
    this.processedUUIDs.clear();
    this.sentUUIDs.clear();
    this.acknowledgedUUIDs.clear();
    this.emit('uuidTrackingCleared');
  }

  // ========== 命令队列方法 ==========

  /**
   * 入队命令
   */
  enqueueCommand(command) {
    const added = this.commandQueue.enqueue(command);
    this.emit('commandEnqueued', {
      command,
      queueLength: this.commandQueue.length(),
      wasMerged: !added
    });
    return added;
  }

  /**
   * 获取队首命令
   */
  peekCommand() {
    return this.commandQueue.peek();
  }

  /**
   * 出队命令
   */
  dequeueCommand() {
    return this.commandQueue.dequeue();
  }

  /**
   * 获取命令队列长度
   */
  getCommandQueueLength() {
    return this.commandQueue.length();
  }

  /**
   * 获取命令队列统计
   */
  getCommandQueueStats() {
    return this.commandQueue.getStats();
  }

  /**
   * 清空命令队列
   */
  clearCommandQueue() {
    const items = this.commandQueue.clear();
    this.emit('commandQueueCleared', { count: items.length });
    return items;
  }

  // ========== Result Holdback 方法 ==========

  /**
   * 挂起结果（等待后台任务）
   */
  holdResult(result) {
    this.heldBackResult = result;
    this.emit('resultHeld', { result });
  }

  /**
   * 获取挂起的结果
   */
  getHeldResult() {
    return this.heldBackResult;
  }

  /**
   * 释放挂起的结果
   */
  releaseHeldResult() {
    const result = this.heldBackResult;
    this.heldBackResult = null;
    if (result) {
      this.emit('resultReleased', { result });
    }
    return result;
  }

  /**
   * 检查是否有挂起的结果
   */
  hasHeldResult() {
    return this.heldBackResult !== null;
  }

  // ========== 增强的添加消息（带 UUID 追踪） ==========

  /**
   * 添加消息（带 UUID 去重）
   * @param {Object} message - 消息对象
   * @param {Object} options - 选项
   * @param {boolean} options.skipDuplicateCheck - 跳过重复检查
   * @returns {Object|null} 如果是重复则返回 null
   */
  addMessageWithDedupe(message, options = {}) {
    const { skipDuplicateCheck = false } = options;

    // UUID 去重检查
    if (!skipDuplicateCheck && message.uuid) {
      if (this.processedUUIDs.has(message.uuid)) {
        this.emit('duplicateSkipped', { uuid: message.uuid, message });
        return null;
      }
      this.processedUUIDs.add(message.uuid);
    }

    return this.addMessage(message);
  }

  /**
   * 批量添加消息（带 UUID 追踪）
   */
  addMessagesBatch(messages, options = {}) {
    const results = [];
    const duplicates = [];

    for (const msg of messages) {
      const result = this.addMessageWithDedupe(msg, options);
      if (result) {
        results.push(result);
      } else if (msg.uuid && this.processedUUIDs.has(msg.uuid)) {
        duplicates.push(msg.uuid);
      }
    }

    this.emit('batchAdded', {
      added: results.length,
      duplicates: duplicates.length,
      total: messages.length
    });

    return { added: results, duplicates };
  }

  // ========== 工具方法 ==========

  /**
   * 创建带 UUID 的消息（确保唯一性）
   */
  createMessageWithUniqueUUID(type, content, metadata = {}) {
    let uuid = metadata.uuid;

    // 确保 UUID 唯一
    if (!uuid || this.processedUUIDs.has(uuid)) {
      uuid = this._generateUUID();
    }

    return this.createMessage(type, content, { ...metadata, uuid });
  }

  /**
   * 获取完整的诊断信息
   */
  getDiagnostics() {
    return {
      messages: {
        count: this.messages.length,
        max: this.maxMessages
      },
      uuidTracking: this.getUUIDSetStats(),
      flushGate: this.getFlushGateStats(),
      commandQueue: this.getCommandQueueStats(),
      heldResult: this.hasHeldResult(),
      memory: process.memoryUsage()
    };
  }

  /**
   * 重置所有状态
   */
  resetAll() {
    this.clear();
    this.clearUUIDTracking();
    this.resetFlushGate();
    this.clearCommandQueue();
    this.heldBackResult = null;
    this.emit('resetAll');
  }

  /**
   * 序列化状态（用于持久化）
   */
  serialize() {
    return {
      messages: this.messages,
      stats: this.getStats(),
      diagnostics: this.getDiagnostics(),
      serializedAt: Date.now()
    };
  }

  /**
   * 从序列化状态恢复
   */
  deserialize(data) {
    if (data.messages) {
      this.messages = data.messages;
    }
    this.emit('deserialized', { messageCount: this.messages?.length || 0 });
  }
}

module.exports = {
  MessageService,
  BoundedUUIDSet,
  FlushGate,
  CommandQueue
};
