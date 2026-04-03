/**
 * AI推理Web Worker
 * 在后台线程运行AI推理，避免阻塞UI
 */

let transformers = null;
let pipeline = null;
let model = null;

self.onmessage = async (e) => {
  const { type, data, id } = e.data;

  try {
    switch (type) {
      case 'init':
        await initTransformers(data);
        self.postMessage({ type: 'ready', id });
        break;

      case 'loadPipeline':
        await loadPipeline(data);
        self.postMessage({ type: 'pipelineReady', id });
        break;

      case 'infer':
        const result = await runInference(data);
        self.postMessage({ type: 'inferenceResult', id, result });
        break;

      case 'terminate':
        self.close();
        break;

      default:
        self.postMessage({ type: 'error', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
};

async function initTransformers(data) {
  transformers = await import('@huggingface/transformers');
  
  const { env } = transformers;
  env.allowLocalModels = true;
  env.useBrowserCache = true;
}

async function loadPipeline(data) {
  if (!transformers) {
    await initTransformers(data);
  }

  const { pipeline: p } = transformers;
  
  pipeline = await p(data.task, data.model, {
    device: data.device || 'webgpu',
    dtype: data.dtype || 'q8',
    progress_callback: (progress) => {
      self.postMessage({ type: 'progress', data: progress });
    }
  });
}

async function runInference(data) {
  if (!pipeline) {
    throw new Error('Pipeline not loaded');
  }

  const { input, options } = data;
  const result = await pipeline(input, options);
  
  return result;
}
