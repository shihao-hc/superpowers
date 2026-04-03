// Phase 2: Router & multi-agent routing sanity checks
const path = require('path');
const { PersonalityManager } = require('../src/personality/PersonalityManager');
const ChatAgent = require('../src/agents/ChatAgent');
const MemoryAgent = require('../src/agents/MemoryAgent');
const MediaAgent = require('../src/agents/MediaAgent');
const GameAgent = require('../src/agents/GameAgent');
const RouterAgent = require('../src/agents/RouterAgent');

(async () => {
  const dataPath = path.resolve(__dirname, '..', 'data', 'personalities.json');
  const pm = new PersonalityManager(dataPath);
  pm.load();
  if (pm.personalities && pm.personalities['default']) {
    pm.setActive('default');
  }
  // initialize agents
  const chat = new ChatAgent(pm);
  const memory = new MemoryAgent();
  const media = new MediaAgent();
  const game = new GameAgent();
  const router = new RouterAgent(pm, chat, memory, media, game);

  // simple route test
  const inputs = [
    'What is the weather today?',
    'Play a game with me',
    'Tell me a memory about yesterday',
    'Just hello'
  ];
  console.log('Phase 2 Test: routing examples');
  for (const inpt of inputs) {
    const res = router.routeMessage(inpt, {});
    console.log('- input:', inpt);
    console.log('  -> reply:', res.reply);
    console.log('  routing:', res.routing);
    // Basic assertions for demonstration
    if (inpt.toLowerCase().includes('memory')) {
      if (memory.retrieve('last_user_message') !== inpt) {
        console.error('MemoryAgent: last_user_message not persisted as expected.');
        process.exit(2);
      }
    }
    if (inpt.toLowerCase().includes('play') || inpt.toLowerCase().includes('weather') || inpt.toLowerCase().includes('just')) {
      // Should route to ChatAgent by default or via router
      if (!res.routing || !res.routing.target) {
        console.error('Router did not provide a routing target for ChatAgent.');
        process.exit(3);
      }
    }
    if (inpt.toLowerCase().includes('game')) {
      if (!res.routing || res.routing.target !== 'GameAgent') {
        console.error('GameAgent routing not as expected.');
        process.exit(4);
      }
    }
  }
  // Additional memory dump assertion using MemoryAgent.dump()
  if (typeof memory.dump === 'function') {
    const dump = memory.dump();
    console.log('Phase 2 Test: Memory dump snapshot', dump);
  }
  }
  process.exit(0);
})();
