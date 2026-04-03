/**
 * WebGPU AI推理引擎 - Browser-Inline AI Inference
 * 
 * 功能:
 * - 纯浏览器内AI推理
 * - 支持Transformer模型(文本分类、问答、嵌入)
 * - WebLLM大语言模型支持
 * - 渐进式增强(WebGPU → WebGL → WASM → CPU)
 * 
 * 基于 transformers.js 和 WebLLM 设计
 */

class WebGPUInferenceEngine {
  constructor(options = {}) {
    this.options = {
      // 默认设备
      device: options.device || 'auto',
      // 量化类型
      dtype: options.dtype || 'q8',
      // 模型类型
      modelType: options.modelType || 'transformers',
      // Web Worker
      useWorker: options.useWorker !== false,
      // 回调
      onReady: options.onReady || null,
      onProgress: options.onProgress || null,
      onError: options.onError || null
    };

    this.device = null;
    this.isReady = false;
    this.pipeline = null;
    this.worker = null;

    // 支持的设备
    this.supportedDevices = {
      webgpu: false,
      webgl: false,
      wasm: true,
      cpu: true
    };

    // 统计数据
    this.stats = {
      totalInferences: 0,
      avgLatency: 0,
      totalTokens: 0
    };
  }

  /**
   * 检测设备能力
   */
  async detectCapabilities() {
    const capabilities = {
      webgpu: false,
      webgl: false,
      wasm: true,
      tier: 'C',
      vendor: 'unknown',
      renderer: 'unknown'
    };

    // 检测WebGPU
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          capabilities.webgpu = true;
          const info = await adapter.requestAdapterInfo();
          capabilities.vendor = info.vendor;
          capabilities.renderer = info.renderer;
        }
      } catch (e) {
        console.warn('[WebGPUInference] WebGPU detection failed:', e);
      }
    }

    // 检测WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      capabilities.webgl = true;
    }

    // 计算等级
    if (capabilities.webgpu) {
      capabilities.tier = 'S';
    } else if (capabilities.webgl) {
      capabilities.tier = 'A';
    } else {
      capabilities.tier = 'B';
    }

    this.supportedDevices = capabilities;
    return capabilities;
  }

  /**
   * 初始化引擎
   */
  async init() {
    try {
      // 检测设备能力
      const caps = await this.detectCapabilities();
      
      // 根据设备选择最佳后端
      this.device = this._selectBestDevice(caps);
      
      if (this.options.useWorker) {
        await this._initWorker();
      } else {
        await this._initDirect();
      }

      this.isReady = true;
      
      if (this.options.onReady) {
        this.options.onReady({ device: this.device, capabilities: caps });
      }

      return true;

    } catch (error) {
      console.error('[WebGPUInference] Init error:', error);
      if (this.options.onError) {
        this.options.onError(error);
      }
      throw error;
    }
  }

  /**
   * 选择最佳设备
   */
  _selectBestDevice(capabilities) {
    if (this.options.device !== 'auto') {
      return this.options.device;
    }

    if (capabilities.webgpu) return 'webgpu';
    if (capabilities.webgl) return 'webgl';
    return 'wasm';
  }

  /**
   * 初始化Web Worker
   */
  async _initWorker() {
    this.worker = new Worker('/components/ai-inference-worker.js');
    
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const { type, data, error } = e.data;
        
        if (type === 'ready') {
          this.isReady = true;
          resolve();
        } else if (type === 'progress') {
          if (this.options.onProgress) {
            this.options.onProgress(data);
          }
        } else if (type === 'error') {
          reject(new Error(error));
        }
      };

      this.worker.onerror = (e) => {
        reject(new Error(e.message));
      };

      this.worker.postMessage({
        type: 'init',
        device: this.device,
        dtype: this.options.dtype,
        modelType: this.options.modelType
      });
    });
  }

  /**
   * 初始化直接模式
   */
  async _initDirect() {
    // 动态导入transformers.js
    const { pipeline, env } = await import('@huggingface/transformers');

    // 配置环境
    env.allowLocalModels = true;
    env.useBrowserCache = true;
    
    // 设置设备
    env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
  }

  /**
   * 加载管道
   */
  async loadPipeline(task, model, config = {}) {
    if (this.worker) {
      return new Promise((resolve, reject) => {
        const id = Date.now();
        
        const handler = (e) => {
          if (e.data.type === 'pipelineReady' && e.data.id === id) {
            this.worker.removeEventListener('message', handler);
            this.pipeline = { task, model, id };
            resolve();
          } else if (e.data.type === 'error') {
            this.worker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };

        this.worker.addEventListener('message', handler);
        this.worker.postMessage({
          type: 'loadPipeline',
          id,
          task,
          model,
          device: this.device,
          dtype: config.dtype || this.options.dtype,
          ...config
        });
      });
    } else {
      const { pipeline } = await import('@huggingface/transformers');
      this.pipeline = await pipeline(task, model, {
        device: this.device,
        dtype: config.dtype || this.options.dtype,
        progress_callback: (progress) => {
          if (this.options.onProgress) {
            this.options.onProgress(progress);
          }
        }
      });
    }
  }

  /**
   * 推理
   */
  async infer(input, options = {}) {
    if (!this.isReady || !this.pipeline) {
      throw new Error('Engine not ready');
    }

    const startTime = performance.now();

    try {
      let result;

      if (this.worker) {
        result = await this._inferWorker(input, options);
      } else {
        result = await this.pipeline(input, options);
      }

      const latency = performance.now() - startTime;
      
      this.stats.totalInferences++;
      this.stats.avgLatency = (this.stats.avgLatency * (this.stats.totalInferences - 1) + latency) / this.stats.totalInferences;

      return {
        success: true,
        result,
        latency,
        device: this.device
      };

    } catch (error) {
      console.error('[WebGPUInference] Inference error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Worker推理
   */
  _inferWorker(input, options) {
    return new Promise((resolve, reject) => {
      const id = Date.now();
      
      const handler = (e) => {
        if (e.data.type === 'inferenceResult' && e.data.id === id) {
          this.worker.removeEventListener('message', handler);
          resolve(e.data.result);
        } else if (e.data.type === 'error') {
          this.worker.removeEventListener('message', handler);
          reject(new Error(e.data.error));
        }
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({
        type: 'infer',
        id,
        input,
        options
      });
    });
  }

  /**
   * 文本分类
   */
  async classifyText(text, candidateLabels) {
    await this.loadPipeline('zero-shot-classification', 'Xenova/distilbert-base-uncased-finetuned-mnli');
    
    return this.infer(text, { candidate_labels: candidateLabels });
  }

  /**
   * 问答
   */
  async questionAnswer(context, question) {
    await this.loadPipeline('question-answering', 'Xenova/distilbert-base-uncased-distilled-squad');
    
    return this.infer({ context, question });
  }

  /**
   * 文本生成
   */
  async generateText(prompt, options = {}) {
    await this.loadPipeline('text-generation', 'Xenova/gpt2', {
      dtype: 'fp32'
    });
    
    return this.infer(prompt, {
      max_new_tokens: options.maxTokens || 100,
      temperature: options.temperature || 0.7,
      do_sample: true,
      ...options
    });
  }

  /**
   * 获取嵌入
   */
  async getEmbedding(text) {
    await this.loadPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    const result = await this.infer(text, { pooling: 'mean', normalize: true });
    
    if (result.success && result.result.data) {
      return Array.from(result.result.data);
    }
    
    return null;
  }

  /**
   * 获取批量嵌入
   */
  async getEmbeddings(texts) {
    await this.loadPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    const result = await this.infer(texts, { pooling: 'mean', normalize: true });
    
    if (result.success && result.result.data) {
      return result.result.data.map(arr => Array.from(arr));
    }
    
    return null;
  }

  /**
   * 情感分析
   */
  async sentimentAnalysis(text) {
    await this.loadPipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
    
    return this.infer(text);
  }

  /**
   * 摘要生成
   */
  async summarize(text, maxLength = 150) {
    await this.loadPipeline('summarization', 'Xenova/distilbert-base-uncased-finetuned-cnn');
    
    return this.infer(text, {
      max_length: maxLength,
      min_length: 50
    });
  }

  /**
   * 翻译
   */
  async translate(text, sourceLang = 'en', targetLang = 'zh') {
    await this.loadPipeline('translation', 'Xenova/mbart-large-50-many-to-many-mmt');
    
    return this.infer(text, {
      task: 'translation',
      src_lang: sourceLang,
      tgt_lang: targetLang
    });
  }

  /**
   * 获取统计
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 获取能力
   */
  getCapabilities() {
    return { ...this.supportedDevices };
  }

  /**
   * 终止
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
  }
}

/**
 * WebLLM 大语言模型引擎
 * 支持 Llama, Phi, Mistral 等大模型
 */
class WebLLMEngine {
  constructor(options = {}) {
    this.options = {
      // 模型名称
      model: options.model || 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      // 设备
      device: options.device || 'auto',
      // 上下文大小
      contextWindowSize: options.contextWindowSize || 4096,
      // 预填充大小
      prefillChunkSize: options.prefillChunkSize || 512,
      // 回调
      onReady: options.onReady || null,
      onProgress: options.onProgress || null,
      onStream: options.onStream || null,
      onError: options.onError || null
    };

    this.engine = null;
    this.isReady = false;
    this._streamController = null;

    // 支持的模型
    this.supportedModels = {
      'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
        size: '~800MB',
        minVRAM: '2GB',
        tokensPerSec: '~50',
        quality: 'medium'
      },
      'Phi-3.5-mini-instruct-q4f16_1-MLC': {
        size: '~2.5GB',
        minVRAM: '4GB',
        tokensPerSec: '~40',
        quality: 'high'
      },
      'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': {
        size: '~4.5GB',
        minVRAM: '6GB',
        tokensPerSec: '~25',
        quality: 'high'
      },
      'Qwen2.5-3B-Instruct-q4f16_1-MLC': {
        size: '~2GB',
        minVRAM: '3GB',
        tokensPerSec: '~45',
        quality: 'medium-high'
      }
    };
  }

  /**
   * 初始化引擎
   */
  async init() {
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      this._emit('downloading', { message: 'Loading model...' });

      this.engine = await CreateMLCEngine(this.options.model, {
        device: this.options.device === 'auto' ? 'webgpu' : this.options.device,
        contextWindowSize: this.options.contextWindowSize,
        prefillChunkSize: this.options.prefillChunkSize,
        initProgressCallback: (progress) => {
          if (this.options.onProgress) {
            this.options.onProgress(progress);
          }
        }
      });

      this.isReady = true;
      
      if (this.options.onReady) {
        this.options.onReady({
          model: this.options.model,
          stats: this.engine.getStats?.() || {}
        });
      }

      this._emit('ready', { model: this.options.model });
      return true;

    } catch (error) {
      console.error('[WebLLMEngine] Init error:', error);
      if (this.options.onError) {
        this.options.onError(error);
      }
      throw error;
    }
  }

  /**
   * 聊天完成
   */
  async chat(messages, options = {}) {
    if (!this.isReady || !this.engine) {
      throw new Error('Engine not ready');
    }

    const startTime = performance.now();
    let totalTokens = 0;

    try {
      // 流式响应
      if (options.stream !== false) {
        return this._streamChat(messages, options, startTime);
      }

      // 非流式响应
      const completion = await this.engine.chat.completions.create({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 512,
        top_p: options.topP || 0.9,
        frequency_penalty: options.frequencyPenalty || 0.5,
        presence_penalty: options.presencePenalty || 0.0
      });

      const response = completion.choices[0]?.message?.content || '';
      totalTokens = completion.usage?.total_tokens || response.length / 4;

      return {
        success: true,
        content: response,
        usage: completion.usage,
        latency: performance.now() - startTime
      };

    } catch (error) {
      console.error('[WebLLMEngine] Chat error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 流式聊天
   */
  async _streamChat(messages, options, startTime) {
    const chunks = [];
    let fullContent = '';
    let totalTokens = 0;

    try {
      const stream = await this.engine.chat.completions.create({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 512,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chunks.push(content);
          fullContent += content;
          
          if (this.options.onStream) {
            this.options.onStream({
              content,
              delta: fullContent,
              done: false
            });
          }
        }
      }

      if (this.options.onStream) {
        this.options.onStream({
          content: '',
          delta: fullContent,
          done: true,
          latency: performance.now() - startTime
        });
      }

      return {
        success: true,
        content: fullContent,
        latency: performance.now() - startTime
      };

    } catch (error) {
      console.error('[WebLLMEngine] Stream error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 简单聊天
   */
  async simpleChat(prompt, systemPrompt = 'You are a helpful AI assistant.') {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]);
  }

  /**
   * 获取统计
   */
  getStats() {
    if (this.engine && this.engine.getStats) {
      return this.engine.getStats();
    }
    return null;
  }

  /**
   * 重置聊天
   */
  async resetChat() {
    if (this.engine && this.engine.resetChat) {
      await this.engine.resetChat();
      this._emit('reset', {});
    }
  }

  /**
   * 终止
   */
  terminate() {
    if (this.engine) {
      this.engine.terminate?.();
      this.engine = null;
    }
    this.isReady = false;
  }

  /**
   * 发送事件
   */
  _emit(event, data) {
    console.log(`[WebLLMEngine] ${event}:`, data);
  }
}

// 工厂函数
async function createWebGPUInference(options = {}) {
  const engine = new WebGPUInferenceEngine(options);
  await engine.init();
  return engine;
}

async function createWebLLM(options = {}) {
  const engine = new WebLLMEngine(options);
  await engine.init();
  return engine;
}

if (typeof window !== 'undefined') {
  window.WebGPUInferenceEngine = WebGPUInferenceEngine;
  window.WebLLMEngine = WebLLMEngine;
  window.createWebGPUInference = createWebGPUInference;
  window.createWebLLM = createWebLLM;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebGPUInferenceEngine, WebLLMEngine, createWebGPUInference, createWebLLM };
}
