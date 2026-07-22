/**
 * Core module exports
 */

const SelfLearningSystem = require('./SelfLearningSystem');
let BrainFlow;
try { BrainFlow = require('./BrainFlow'); } catch { BrainFlow = null; }

module.exports = {
  SelfLearningSystem,
  BrainFlow
};
