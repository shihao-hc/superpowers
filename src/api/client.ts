/**
 * API Module - API 调用封装
 */

export interface APIOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  thinkingConfig?: {
    type: 'enabled';
    budgetTokens?: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamEvent {
  type: 'content_block_delta' | 'message_start' | 'message_stop' | 'error';
  delta?: { type: 'text_delta'; text: string };
  message?: ChatMessage;
  error?: string;
}

export type StreamCallback = (event: StreamEvent) => void;

export class APIClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultOptions: APIOptions;

  constructor(options: {
    baseUrl?: string;
    apiKey?: string;
    defaultOptions?: APIOptions;
  } = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.apiKey = options.apiKey;
    this.defaultOptions = options.defaultOptions || {};
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], options: APIOptions = {}): Promise<string> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: mergedOptions.model || 'llama3.2',
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as { message?: { content?: string } };
      return data.message?.content || '';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Chat failed: ${error.message}`);
      }
      throw error;
    }
  }

  async* streamChat(
    messages: ChatMessage[],
    options: APIOptions = {},
    onEvent?: StreamCallback
  ): AsyncGenerator<string, void, unknown> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: mergedOptions.model || 'llama3.2',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            
            if (data.error) {
              onEvent?.({ type: 'error', error: data.error });
              throw new Error(data.error);
            }

            if (data.message?.content) {
              onEvent?.({
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: data.message.content },
              });
              yield data.message.content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generate(prompt: string, options: APIOptions = {}): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async* streamGenerate(
    prompt: string,
    options: APIOptions = {},
    onEvent?: StreamCallback
  ): AsyncGenerator<string, void, unknown> {
    yield* this.streamChat([{ role: 'user', content: prompt }], options, onEvent);
  }
}

export const globalAPIClient = new APIClient();

export function createAPIClient(options?: {
  baseUrl?: string;
  apiKey?: string;
  defaultOptions?: APIOptions;
}): APIClient {
  return new APIClient(options);
}
