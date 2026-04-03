const SAFE_ACTIONS = new Set(['move', 'dig', 'place', 'equip', 'attack', 'chat', 'wait', 'find', 'craft', 'check', 'set', 'goto']);
const MAX_COORD_VALUE = 30000000;
const MIN_COORD_VALUE = -30000000;
const MAX_TASK_STEPS = 50;
const MAX_VARIABLE_SIZE = 1000;

function validateCoord(value) {
  const num = parseInt(value);
  return !isNaN(num) && num >= MIN_COORD_VALUE && num <= MAX_COORD_VALUE;
}

function sanitizeActionParam(param) {
  if (!param) return '';
  return String(param).substring(0, MAX_VARIABLE_SIZE).replace(/[;\n\r]/g, ' ').trim();
}

class TaskPlanner {
  constructor(gameAgent, chatAgent, memoryAgent) {
    this.game = gameAgent;
    this.chat = chatAgent;
    this.memory = memoryAgent;
    this.currentTask = null;
    this.taskHistory = [];
    this.variables = {};
    this.executionState = {
      loopCount: 0,
      maxLoopIterations: 100,
      errorCount: 0,
      maxErrors: 5,
      maxSteps: MAX_TASK_STEPS
    };
    this.auditLog = [];
    this.MAX_AUDIT_LOG = 1000;
  }

  _audit(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      details: typeof details === 'object' ? { ...details } : { message: details }
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.MAX_AUDIT_LOG) {
      this.auditLog.shift();
    }
    console.log(`[TaskPlanner] [${action}]`, details);
  }

  async planTask(userRequest) {
    const status = this.game.getStatus();
    const inventory = status.inventory || [];
    const pos = status.position || { x: 0, y: 0, z: 0 };
    const health = status.health || 20;
    const food = status.food || 20;

    const context = `
当前状态:
- 位置: x=${pos.x || 0}, y=${pos.y || 0}, z=${pos.z || 0}
- 背包: ${inventory.map(i => `${i.name} x${i.count}`).join(', ') || '空'}
- 血量: ${health}/20
- 饱食度: ${food}/20

用户请求: "${userRequest}"

请将任务分解为可执行的步骤，支持:
- 顺序执行: STEP_N
- 条件分支: IF health < 5 THEN STEP_3 ELSE STEP_2
- 循环: LOOP 3 TIMES -> STEP_N ... END
- 变量: SET target = stone

格式:
STEP_1: [动作] [目标]
IF health < 5 THEN STEP_5 ELSE STEP_2
LOOP 3 TIMES
  STEP_3: dig nearby
END
STEP_4: chat "任务完成!"

可用动作:
- move: 移动到坐标
- dig: 挖掘方块
- place: 放置方块
- equip: 装备物品
- attack: 攻击实体
- craft: 合成物品
- chat: 发送聊天消息
- wait: 等待(秒数)
- check: 检查条件`;

    try {
      const result = await this.chat.respond(context);
      const plan = this._parsePlan(result.reply);
      
      if (plan.length > 0) {
        this.currentTask = { 
          request: userRequest, 
          steps: plan, 
          status: 'planned',
          createdAt: new Date().toISOString()
        };
        this.variables = {};
        this._saveToMemory('task_planned', { request: userRequest, steps: plan.length });
        return {
          ok: true,
          request: userRequest,
          steps: plan,
          estimatedTime: this._estimateTime(plan)
        };
      }
    } catch (err) {
      console.error('[TaskPlanner] Plan error:', err.message);
    }

    return { ok: false, error: '无法生成任务计划' };
  }

  _parsePlan(text) {
    const steps = [];
    const lines = text.split('\n');
    let loopStack = [];
    let currentLoop = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.toUpperCase().startsWith('LOOP')) {
        const match = trimmed.match(/LOOP\s+(\d+)\s+TIMES/i);
        if (match) {
          currentLoop = {
            type: 'loop',
            iterations: parseInt(match[1]),
            steps: [],
            line: trimmed
          };
          loopStack.push(currentLoop);
        }
        continue;
      }
      
      if (trimmed.toUpperCase() === 'END') {
        if (loopStack.length > 0) {
          const loop = loopStack.pop();
          if (loopStack.length > 0) {
            loopStack[loopStack.length - 1].steps.push(loop);
          } else {
            steps.push(loop);
          }
          currentLoop = null;
        }
        continue;
      }
      
      const ifMatch = trimmed.match(/IF\s+(.+?)\s+THEN\s+STEP_?(\d+)\s+ELSE\s+STEP_?(\d+)/i);
      if (ifMatch) {
        const condition = {
          type: 'if',
          condition: ifMatch[1].trim(),
          thenStep: parseInt(ifMatch[2]),
          elseStep: parseInt(ifMatch[3]),
          line: trimmed
        };
        if (currentLoop) {
          currentLoop.steps.push(condition);
        } else {
          steps.push(condition);
        }
        continue;
      }
      
      const match = trimmed.match(/STEP_?\d*\s*:\s*(.+)/i);
      if (match) {
        const stepText = match[1].trim();
        const parts = stepText.split(/\s+/);
        const action = parts[0]?.toLowerCase();
        
        if (SAFE_ACTIONS.has(action)) {
          const step = {
            type: 'step',
            action,
            target: sanitizeActionParam(parts.slice(1, 3).join(' ')),
            params: sanitizeActionParam(parts.slice(3).join(' ')),
            raw: sanitizeActionParam(stepText)
          };
          
          if (currentLoop) {
            currentLoop.steps.push(step);
          } else {
            if (steps.length >= MAX_TASK_STEPS) {
              this._audit('warn', `Max steps limit reached: ${MAX_TASK_STEPS}`);
              continue;
            }
            steps.push(step);
          }
        }
      }
    }
    
    return steps;
  }

  _evaluateCondition(condition) {
    const status = this.game.getStatus();
    const health = status.health || 20;
    const food = status.food || 20;
    const inventory = status.inventory || [];
    
    const ctx = {
      health,
      food,
      x: status.position?.x || 0,
      y: status.position?.y || 0,
      z: status.position?.z || 0,
      ...this.variables
    };
    
    const hasInventory = (item) => {
      const lowerItem = item.toLowerCase();
      return inventory.some(i => i.name.toLowerCase().includes(lowerItem));
    };
    
    const parseValue = (token) => {
      if (/^true$/i.test(token)) return true;
      if (/^false$/i.test(token)) return false;
      if (/^null$/i.test(token)) return null;
      const num = parseFloat(token);
      if (!isNaN(num)) return num;
      return ctx[token] !== undefined ? ctx[token] : (hasInventory(token) ? true : 0);
    };
    
    const safeEval = (expr) => {
      const allowedChars = /^[a-zA-Z0-9_<>=!&|().\s]+$/;
      if (!allowedChars.test(expr)) {
        throw new Error('Invalid characters in expression');
      }
      
      for (const [key, value] of Object.entries(ctx)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        expr = expr.replace(regex, String(value));
      }
      
      expr = expr.replace(/\bhas\("([^"]+)"\)/gi, (_, item) => String(hasInventory(item)));
      
      const tokens = expr.match(/(\d+\.?\d*|[a-zA-Z_]\w*|>=|<=|==|!=|>|<|&&|\|\||!|\(|\))/g) || [];
      
      for (const token of tokens) {
        if (/^\d+\.?\d*$/.test(token)) continue;
        if (/^(true|false|null|undefined)$/.test(token)) continue;
        if (/^(&&|\|\||!|>=|<=|==|!=|>|<|\(|\))$/.test(token)) continue;
        if (/^[a-zA-Z_]\w*$/.test(token) && !isNaN(parseFloat(token))) continue;
        throw new Error(`Unsafe token: ${token}`);
      }
      
      const operators = {
        '==': (a, b) => a === b,
        '!=': (a, b) => a !== b,
        '>': (a, b) => a > b,
        '<': (a, b) => a < b,
        '>=': (a, b) => a >= b,
        '<=': (a, b) => a <= b
      };
      
      const tokenize = (expr) => {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
          const ch = expr[i];
          if (/\s/.test(ch)) { i++; continue; }
          if (ch === '(' || ch === ')') { tokens.push({ type: 'paren', value: ch }); i++; continue; }
          if (ch === '!') {
            if (expr[i+1] === '=') { tokens.push({ type: 'op', value: '!=' }); i += 2; }
            else { tokens.push({ type: 'op', value: '!' }); i++; }
            continue;
          }
          if (ch === '&' && expr[i+1] === '&') { tokens.push({ type: 'op', value: '&&' }); i += 2; continue; }
          if (ch === '|' && expr[i+1] === '|') { tokens.push({ type: 'op', value: '||' }); i += 2; continue; }
          if (ch === '<' || ch === '>') {
            if (expr[i+1] === '=') { tokens.push({ type: 'op', value: ch + '=' }); i += 2; }
            else { tokens.push({ type: 'op', value: ch }); i++; }
            continue;
          }
          if (ch === '=') {
            if (expr[i+1] === '=') { tokens.push({ type: 'op', value: '==' }); i += 2; }
            else if (expr[i+1] === '!' && expr[i+2] === '=') { tokens.push({ type: 'op', value: '!=' }); i += 3; }
            else { i++; }
            continue;
          }
          const numMatch = expr.slice(i).match(/^(\d+\.?\d*)/);
          if (numMatch) { tokens.push({ type: 'num', value: parseFloat(numMatch[1]) }); i += numMatch[1].length; continue; }
          const wordMatch = expr.slice(i).match(/^[a-zA-Z_]\w*/);
          if (wordMatch) { tokens.push({ type: 'var', value: wordMatch[0] }); i += wordMatch[0].length; continue; }
          i++;
        }
        return tokens;
      };
      
      const evaluateTokens = (tokens, start = 0) => {
        const parseOr = (idx) => {
          let [left, i] = parseAnd(idx);
          while (i < tokens.length && tokens[i]?.value === '||') {
            i++;
            const [right, newI] = parseAnd(i);
            left = left || right;
            i = newI;
          }
          return [left, i];
        };
        
        const parseAnd = (idx) => {
          let [left, i] = parseNot(idx);
          while (i < tokens.length && tokens[i]?.value === '&&') {
            i++;
            const [right, newI] = parseNot(i);
            left = left && right;
            i = newI;
          }
          return [left, i];
        };
        
        const parseNot = (idx) => {
          if (tokens[idx]?.value === '!') {
            const [result, i] = parseNot(idx + 1);
            return [!result, i];
          }
          return parseCompare(idx);
        };
        
        const parseCompare = (idx) => {
          let [left, i] = parsePrimary(idx);
          while (i < tokens.length && ['<', '>', '<=', '>=', '==', '!='].includes(tokens[i]?.value)) {
            const op = tokens[i].value;
            i++;
            const [right, newI] = parsePrimary(i);
            const lNum = parseFloat(left);
            const rNum = parseFloat(right);
            if (op === '<') left = lNum < rNum;
            else if (op === '>') left = lNum > rNum;
            else if (op === '<=') left = lNum <= rNum;
            else if (op === '>=') left = lNum >= rNum;
            else if (op === '==') left = left == right;
            else if (op === '!=') left = left != right;
            i = newI;
          }
          return [left, i];
        };
        
        const parsePrimary = (idx) => {
          const tok = tokens[idx];
          if (!tok) return [false, idx];
          if (tok.type === 'num') return [tok.value, idx + 1];
          if (tok.type === 'var') return [parseValue(tok.value), idx + 1];
          if (tok.type === 'paren') {
            if (tok.value === '(') {
              const [result, i] = parseOr(idx + 1);
              return [result, i + 1];
            }
          }
          return [false, idx + 1];
        };
        
        const [result] = parseOr(start);
        return !!result;
      };
      
      const tokenObjs = tokenize(expr);
      return evaluateTokens(tokenObjs);
    };
    
    try {
      return safeEval(condition.toLowerCase());
    } catch (err) {
      console.warn('[TaskPlanner] Condition eval error:', err.message);
      return false;
    }
  }

  async executePlan(steps) {
    const results = [];
    this.executionState = {
      loopCount: 0,
      maxLoopIterations: 100,
      errorCount: 0,
      maxErrors: 5
    };
    
    let stepIndex = 0;
    
    while (stepIndex < steps.length) {
      if (this.executionState.loopCount > this.executionState.maxLoopIterations) {
        return { ok: false, error: '循环次数过多，已终止' };
      }
      
      if (this.executionState.errorCount > this.executionState.maxErrors) {
        return { ok: false, error: '错误次数过多，已终止' };
      }
      
      const currentStep = steps[stepIndex];
      
      try {
        let result;
        
        if (currentStep.type === 'step') {
          result = await this._executeStep(currentStep);
          results.push({ index: stepIndex, ...result });
          
          if (!result.ok && currentStep.action !== 'check') {
            this.executionState.errorCount++;
          }
          
          stepIndex++;
        } else if (currentStep.type === 'if') {
          const conditionMet = this._evaluateCondition(currentStep.condition);
          if (conditionMet) {
            stepIndex = currentStep.thenStep - 1;
          } else {
            stepIndex = currentStep.elseStep - 1;
          }
          results.push({ index: stepIndex, type: 'if', condition: currentStep.condition, taken: conditionMet });
        } else if (currentStep.type === 'loop') {
          const loopResults = await this._executeLoop(currentStep);
          results.push({ index: stepIndex, type: 'loop', iterations: currentStep.iterations, results: loopResults });
          stepIndex++;
        } else {
          stepIndex++;
        }
        
        this.currentTask = { ...this.currentTask, currentStep: stepIndex, progress: (stepIndex / steps.length * 100).toFixed(0) + '%' };
        
        if (currentStep.type === 'step' && currentStep.action === 'wait') {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        results.push({ index: stepIndex, error: err.message });
        this.executionState.errorCount++;
        stepIndex++;
      }
    }

    this.currentTask = null;
    this._saveToMemory('task_complete', { steps: steps.length, results: results.length });
    
    return { ok: true, results };
  }

  async _executeLoop(loopStep) {
    const loopResults = [];
    for (let i = 0; i < loopStep.iterations; i++) {
      this.executionState.loopCount++;
      for (const step of loopStep.steps) {
        if (step.type === 'step') {
          const result = await this._executeStep(step);
          loopResults.push({ iteration: i, ...result });
        }
      }
    }
    return loopResults;
  }

  async _executeStep(step) {
    if (!step || !SAFE_ACTIONS.has(step.action)) {
      return { ok: false, error: 'Invalid action' };
    }

    this._audit('execute', { action: step.action, target: step.target });

    switch (step.action) {
      case 'move':
        const coords = this._parseCoords(step.target);
        if (coords) {
          return await this.game.moveTo(coords.x, coords.y, coords.z);
        }
        return { ok: false, error: 'Invalid coordinates' };

      case 'dig':
        return await this.game.dig(sanitizeActionParam(step.target));

      case 'place':
        return await this.game.placeBlock(sanitizeActionParam(step.target));

      case 'equip':
        return await this.game.equip(sanitizeActionParam(step.target));

      case 'craft':
        return await this.game.craft?.(sanitizeActionParam(step.target)) || { ok: true, message: `合成: ${step.target}` };

      case 'chat':
        const chatMsg = sanitizeActionParam(step.target);
        if (chatMsg.length > 256) {
          return { ok: false, error: 'Message too long (max 256 chars)' };
        }
        return await this.game.chat(chatMsg);

      case 'wait':
        const seconds = Math.min(Math.max(parseInt(step.params) || 1, 1), 60);
        await new Promise(r => setTimeout(r, seconds * 1000));
        return { ok: true, waited: seconds };

      case 'find':
        return { ok: true, message: `寻找目标: ${step.target}` };

      case 'check':
        const status = this.game.getStatus();
        return { ok: true, status };

      case 'set': {
        const parts = step.target.split(/\s+/);
        const key = sanitizeActionParam(parts[0]);
        const value = sanitizeActionParam(parts.slice(1).join(' '));
        if (!key || key.length > 50) {
          return { ok: false, error: 'Invalid variable name' };
        }
        this.variables[key] = value;
        return { ok: true, message: `设置 ${key} = ${value}` };
      }

      case 'goto':
        const targetStep = Math.max(0, Math.min(parseInt(step.target) - 1, MAX_TASK_STEPS));
        return { ok: true, goto: targetStep };

      default:
        return { ok: false, error: `Unknown action: ${step.action}` };
    }
  }

  _parseCoords(text) {
    if (!text || typeof text !== 'string') return null;
    const nums = text.match(/-?\d+/g);
    if (nums && nums.length >= 3) {
      const x = parseInt(nums[0]);
      const y = parseInt(nums[1]);
      const z = parseInt(nums[2]);
      if (validateCoord(x) && validateCoord(y) && validateCoord(z)) {
        return { x, y, z };
      }
    }
    return null;
  }

  _estimateTime(steps) {
    let baseTime = steps.length * 5;
    for (const step of steps) {
      if (step.type === 'loop') {
        baseTime += step.iterations * step.steps.length * 5;
      }
    }
    return baseTime < 60 ? `${baseTime}秒` : `${Math.floor(baseTime / 60)}分${baseTime % 60}秒`;
  }

  _saveToMemory(type, data) {
    if (this.memory) {
      this.memory.remember(`game_${type}_${Date.now()}`, {
        type,
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  getStatus() {
    return {
      connected: this.game?.connected || false,
      currentTask: this.currentTask,
      taskHistory: this.taskHistory.slice(-10),
      variables: Object.keys(this.variables),
      executionState: this.executionState
    };
  }

  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  clearAuditLog() {
    this.auditLog = [];
    return { ok: true };
  }

  cancelTask() {
    this.currentTask = null;
    this.variables = {};
    return { ok: true, message: '任务已取消' };
  }
}

module.exports = TaskPlanner;
