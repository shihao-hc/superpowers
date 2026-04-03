const path = require('path');
const PluginManager = require('./plugins/PluginManager');
const { PersonalityManager } = require('./personality/PersonalityManager');
const ChatAgent = require('./agents/ChatAgent');
const MemoryAgent = require('./agents/MemoryAgent');
const MediaAgent = require('./agents/MediaAgent');
const GameAgent = require('./agents/GameAgent');
const RouterAgent = require('./agents/RouterAgent');
const InferenceBridge = require('./localInferencing/InferBridge');

// Initialize personality system
const dataPath = path.resolve(__dirname, '../data/personalities.json');
const pm = new PersonalityManager(dataPath);
pm.load();
// Default to 'default' if available
if (pm.personalities && pm.personalities['default']) {
  pm.setActive('default');
}
pm.saveActive();

// Initialize plugins (Phase 5) - optional, non-fatal if plugins missing
let pluginManager = null;
try {
  pluginManager = new PluginManager(path.resolve(__dirname, '..'));
  if (pluginManager && typeof pluginManager.loadPlugins === 'function') {
    pluginManager.loadPlugins();
  }
} catch (e) {
  pluginManager = null;
}

// Initialize agents (skeletons)
const chatAgent = new ChatAgent(pm);
const memoryAgent = new MemoryAgent();
const mediaAgent = new MediaAgent();
const gameAgent = new GameAgent();
const router = new RouterAgent(pm, chatAgent, memoryAgent, mediaAgent, gameAgent);
const ib = new InferenceBridge();
ib.loadModel();

// Simple CLI loop to demonstrate interaction
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.log('AI persona initialized. Type a message to chat (or prefix with "infer:" to run browser inferencer):');
rl.on('line', async (line) => {
  let inputLine = line;
  if (pluginManager && typeof pluginManager.onMessage === 'function') {
    try {
      const pmRes = await pluginManager.onMessage(line, {});
      if (pmRes && pmRes.message) inputLine = pmRes.message;
    } catch (e) {
      // ignore plugin errors to avoid breaking core flow
    }
  }
  if (inputLine.toLowerCase().startsWith('infer:')) {
    const input = inputLine.slice(6).trim();
    const res = ib.infer(input);
    console.log('InferenceBridge:', res.text);
    return;
  }
  const res = router.routeMessage(inputLine, {});
  console.log(res.reply);
  // optional TTS simulation
  if (process.env.TTS_ENABLED === '1') {
    console.log(`(TTS) speaking: ${res.reply}`);
  }
});
