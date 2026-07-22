/**
 * Agent module exports
 */

const suggestionPipeline = require('./SuggestionPipeline');
const messageService = require('./MessageService');
const llmAdapter = require('./LLMAdapter');
const { BrowserAgent } = require('./BrowserAgent');
const { DynamicScraper } = require('./DynamicScraper');
const { AgentLoop, BackgroundTask, BackgroundTaskManager, TaskStatus } = require('./AgentLoop');

module.exports = {
  SuggestionPipeline: suggestionPipeline.SuggestionPipeline,
  SuggestionType: suggestionPipeline.SuggestionType,
  SuggestionPriority: suggestionPipeline.SuggestionPriority,
  PipelineStage: suggestionPipeline.PipelineStage,
  createDefaultPipeline: suggestionPipeline.createDefaultPipeline,
  MessageService: messageService.MessageService,
  BoundedUUIDSet: messageService.BoundedUUIDSet,
  FlushGate: messageService.FlushGate,
  CommandQueue: messageService.CommandQueue,
  LLMAdapter: llmAdapter.LLMAdapter,
  LLMStream: llmAdapter.LLMStream,
  LLMError: llmAdapter.LLMError,
  StreamParser: llmAdapter.StreamParser,
  ErrorTypes: llmAdapter.ErrorTypes,
  LLMBridge: require('./LLMBridge').LLMBridge,
  AgentLoop,
  BackgroundTask,
  BackgroundTaskManager,
  TaskStatus,
  BrowserAgent,
  DynamicScraper
};
