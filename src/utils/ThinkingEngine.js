/**
 * ThinkingEngine - 思维引擎
 *
 * 组合正向/逆向思维解决问题、质疑假设、创造性联想
 */
const BrainUtils = require('./BrainUtils');

class ThinkingEngine {
  constructor(bs) {
    this.bs = bs;
  }

  solve(problem, _options = {}) {
    const bs = this.bs;
    const startTime = Date.now();
    const analysis = {
      problem,
      timestamp: startTime,
      perspectives: {}
    };

    const metaCheck = bs.metaCognition.check(problem.description || problem);
    analysis.metaCheck = metaCheck;

    analysis.perspectives.normal = bs.thinking.multiAngle(problem);

    if (bs.config.enableReverseThinking) {
      analysis.perspectives.reverse = bs.reverseThinking.analyze(problem);
    }

    const combination = BrainUtils.combinePerspectives(analysis.perspectives);
    analysis.combined = combination;

    const solution = {
      description: combination.conclusion,
      confidence: combination.confidence,
      perspectives: Object.keys(analysis.perspectives),
      reasoning: combination.reasoning,
      alternative: combination.alternatives[1] || null,
      executionTime: Date.now() - startTime
    };

    if (bs.config.enableAutoEvolution && bs.selfLearning) {
      bs.evolution.recordProblemSolution(problem, solution);
    }

    return solution;
  }
}

module.exports = ThinkingEngine;
