const fs = require('fs');
const os = require('os');
const path = require('path');

const { PersonalityManager } = require('../../src/personality/PersonalityManager');

describe('PersonalityManager', () => {
  let tmpDir;
  let dataPath;
  let prevCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
    dataPath = path.join(tmpDir, 'personalities.json');
    prevCwd = process.cwd();
    process.chdir(tmpDir);
    fs.writeFileSync(
      dataPath,
      JSON.stringify({ personalities: {}, active: null }),
      'utf8'
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeManager() {
    return new PersonalityManager(dataPath);
  }

  function writeData(personalities, active) {
    fs.writeFileSync(dataPath, JSON.stringify({ personalities, active }), 'utf8');
  }

  test('constructor sets defaults', () => {
    const pm = makeManager();
    expect(pm.dataPath).toBe(dataPath);
    expect(pm.personalities).toEqual({});
    expect(pm.activeName).toBeNull();
    expect(pm.active).toBeNull();
    expect(pm.activeStorePath).toBe(path.join(tmpDir, '.opencode', 'active-personality.json'));
    expect(pm.driftTimer).toBeNull();
  });

  test('load reads personalities and active', async () => {
    writeData({ alice: { name: 'Alice', traits: {} } }, 'alice');
    const pm = makeManager();
    await pm.load();
    expect(pm.personalities.alice.name).toBe('Alice');
    expect(pm.activeName).toBe('alice');
    expect(pm.active.name).toBe('Alice');
    pm.stopMoodDrift();
  });

  test('load starts mood drift for active personality', async () => {
    writeData({ alice: { name: 'Alice', mood: { enabled: true, moods: ['happy'], drift: 1 } } }, 'alice');
    const pm = makeManager();
    pm._startMoodDrift = jest.fn();
    await pm.load();
    expect(pm._startMoodDrift).toHaveBeenCalled();
  });

  test('load handles missing personalities key', async () => {
    fs.writeFileSync(dataPath, JSON.stringify({}), 'utf8');
    const pm = makeManager();
    await pm.load();
    expect(pm.personalities).toEqual({});
    expect(pm.active).toBeNull();
  });

  test('load warns and resets on failure', async () => {
    fs.writeFileSync(dataPath, '{ not json', 'utf8');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pm = makeManager();
    await pm.load();
    expect(warnSpy).toHaveBeenCalled();
    expect(pm.personalities).toEqual({});
    warnSpy.mockRestore();
  });

  test('loadSync reads active from active-store when present', () => {
    writeData({ alice: { name: 'Alice' }, bob: { name: 'Bob' } }, 'bob');
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.opencode', 'active-personality.json'), 'alice', 'utf8');
    const pm = makeManager();
    pm.loadSync();
    expect(pm.activeName).toBe('alice');
    expect(pm.active.name).toBe('Alice');
    pm.stopMoodDrift();
  });

  test('loadSync falls back to json.active when no active-store', () => {
    writeData({ alice: { name: 'Alice' } }, 'alice');
    const pm = makeManager();
    pm.loadSync();
    expect(pm.activeName).toBe('alice');
    pm.stopMoodDrift();
  });

  test('loadSync handles missing personalities key', () => {
    fs.writeFileSync(dataPath, JSON.stringify({ active: null }), 'utf8');
    const pm = makeManager();
    pm.loadSync();
    expect(pm.personalities).toEqual({});
  });

  test('loadSync ignores active-store name not in library', () => {
    writeData({ alice: { name: 'Alice' } }, 'alice');
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.opencode', 'active-personality.json'), 'ghost', 'utf8');
    const pm = makeManager();
    pm.loadSync();
    expect(pm.activeName).toBeNull();
    expect(pm.active).toBeNull();
  });

  test('loadSync warns and resets on failure', () => {
    fs.writeFileSync(dataPath, '{ broken', 'utf8');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pm = makeManager();
    pm.loadSync();
    expect(warnSpy).toHaveBeenCalled();
    expect(pm.personalities).toEqual({});
    warnSpy.mockRestore();
  });

  test('_startMoodDrift clears existing timer', () => {
    const pm = makeManager();
    pm.driftTimer = { _destroyed: true };
    const clearSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
    pm.active = { mood: { enabled: false } };
    pm._startMoodDrift();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  test('_startMoodDrift returns when mood disabled or missing', () => {
    const pm = makeManager();
    pm.active = {};
    pm._startMoodDrift();
    expect(pm.driftTimer).toBeNull();
    pm.active = { mood: { enabled: false } };
    pm._startMoodDrift();
    expect(pm.driftTimer).toBeNull();
  });

  test('_startMoodDrift uses interval and drifts mood', () => {
    jest.useFakeTimers();
    const pm = makeManager();
    pm.active = { mood: { enabled: true, moods: ['happy', 'calm'], drift: 1, intervals: 100 } };
    pm._startMoodDrift();
    expect(pm.driftTimer).not.toBeNull();
    jest.advanceTimersByTime(100);
    expect(['happy', 'calm']).toContain(pm.active.mood);
    pm.stopMoodDrift();
    jest.useRealTimers();
  });

  test('_startMoodDrift defaults interval to 300000', () => {
    jest.useFakeTimers();
    const pm = makeManager();
    pm.active = { mood: { enabled: true, moods: ['neutral'], drift: 1 } };
    pm._startMoodDrift();
    jest.advanceTimersByTime(300000);
    expect(pm.active.mood).toBe('neutral');
    pm.stopMoodDrift();
    jest.useRealTimers();
  });

  test('_startMoodDrift keeps mood when drift not triggered', () => {
    jest.useFakeTimers();
    const moodCfg = { enabled: true, moods: ['happy'], drift: 0, intervals: 100 };
    const pm = makeManager();
    pm.active = { mood: moodCfg };
    pm._startMoodDrift();
    jest.advanceTimersByTime(100);
    expect(pm.active.mood).toBe(moodCfg);
    pm.stopMoodDrift();
    jest.useRealTimers();
  });

  test('_startMoodDrift defaults moods to neutral', () => {
    jest.useFakeTimers();
    const pm = makeManager();
    pm.active = { mood: { enabled: true, drift: 1, intervals: 100 } };
    pm._startMoodDrift();
    jest.advanceTimersByTime(100);
    expect(pm.active.mood).toBe('neutral');
    pm.stopMoodDrift();
    jest.useRealTimers();
  });

  test('stopMoodDrift clears timer and nulls it', () => {
    jest.useFakeTimers();
    const pm = makeManager();
    pm.active = { mood: { enabled: true, moods: ['x'], drift: 1 } };
    pm._startMoodDrift();
    expect(pm.driftTimer).not.toBeNull();
    pm.stopMoodDrift();
    expect(pm.driftTimer).toBeNull();
    jest.useRealTimers();
  });

  test('setActive returns false for empty name', () => {
    const pm = makeManager();
    expect(pm.setActive('')).toBe(false);
    expect(pm.setActive(null)).toBe(false);
  });

  test('setActive returns false for unknown personality', () => {
    const pm = makeManager();
    expect(pm.setActive('nobody')).toBe(false);
  });

  test('setActive activates personality and persists', () => {
    writeData({ alice: { name: 'Alice' } }, null);
    const pm = makeManager();
    pm.loadSync();
    expect(pm.setActive('alice')).toBe(true);
    expect(pm.activeName).toBe('alice');
    const stored = fs.readFileSync(path.join(tmpDir, '.opencode', 'active-personality.json'), 'utf8');
    expect(stored).toBe('alice');
    pm.stopMoodDrift();
  });

  test('getMood returns default mood from active', () => {
    const pm = makeManager();
    expect(pm.getMood()).toBe('neutral');
    pm.active = { mood: { default: 'happy' } };
    expect(pm.getMood()).toBe('happy');
    pm.active = { mood: 'calm' };
    expect(pm.getMood()).toBe('calm');
  });

  test('getTTSConfig returns null when tts disabled', () => {
    const pm = makeManager();
    pm.active = { tts: { enabled: false } };
    expect(pm.getTTSConfig()).toBeNull();
    pm.active = {};
    expect(pm.getTTSConfig()).toBeNull();
  });

  test('getTTSConfig builds config with variants', () => {
    const pm = makeManager();
    pm.active = {
      mood: { default: 'happy' },
      tts: { enabled: true, lang: 'en-US', rateVariants: { happy: 1.1 }, pitchVariants: { happy: 1.2 } }
    };
    expect(pm.getTTSConfig()).toEqual({ lang: 'en-US', rate: 1.1, pitch: 1.2 });
  });

  test('getTTSConfig uses defaults for missing variants', () => {
    const pm = makeManager();
    pm.active = { mood: { default: 'sad' }, tts: { enabled: true } };
    expect(pm.getTTSConfig()).toEqual({ lang: 'zh-CN', rate: 1.0, pitch: 1.0 });
  });

  test('getRoutingKeywords returns intent keywords or empty', () => {
    const pm = makeManager();
    pm.active = { routing: { media: ['播放', '音乐'] } };
    expect(pm.getRoutingKeywords('media')).toEqual(['播放', '音乐']);
    expect(pm.getRoutingKeywords('nope')).toEqual([]);
    expect(makeManager().getRoutingKeywords('x')).toEqual([]);
  });

  test('getResponse returns null for empty responses', () => {
    const pm = makeManager();
    expect(pm.getResponse('greeting')).toBeNull();
    pm.active = { responses: { greeting: [] } };
    expect(pm.getResponse('greeting')).toBeNull();
  });

  test('getResponse picks from responses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const pm = makeManager();
    pm.active = { responses: { greeting: ['hi', 'yo'] } };
    expect(pm.getResponse('greeting')).toBe('yo');
  });

  test('getSystemPrompt returns empty when no active', () => {
    expect(makeManager().getSystemPrompt()).toBe('');
  });

  test('getSystemPrompt fills template', () => {
    const pm = makeManager();
    pm.active = {
      name: 'Bob',
      traits: { style: 'friendly', formality: 'casual' },
      mood: { default: 'happy' }
    };
    const prompt = pm.getSystemPrompt();
    expect(prompt).toContain('Bob');
    expect(prompt).toContain('style:friendly');
    expect(prompt).toContain('formality:casual');
    expect(prompt).toContain('happy');
  });

  test('getSystemPrompt uses custom template and defaults', () => {
    const pm = makeManager();
    pm.active = {
      systemPromptTemplate: 'Hello {name} / {traits} / {mood}',
      mood: { default: 'calm' }
    };
    const prompt = pm.getSystemPrompt();
    expect(prompt).toBe('Hello AI /  / calm');
  });

  test('getCurrentPersonality returns active', () => {
    const pm = makeManager();
    pm.active = { name: 'Alice' };
    expect(pm.getCurrentPersonality()).toEqual({ name: 'Alice' });
  });

  test('applyPersonality prefixes base prompt', () => {
    const pm = makeManager();
    pm.active = { name: 'Bob', traits: { style: 'friendly' }, mood: { default: 'happy' } };
    const out = pm.applyPersonality('hello');
    expect(out).toBe('(Bob) 心情:happy | 特点:style | hello');
  });

  test('applyPersonality handles missing active and traits', () => {
    const pm = makeManager();
    expect(pm.applyPersonality('plain')).toBe('(AI) 心情:neutral | 特点: | plain');
  });

  test('saveActive returns early without active name', () => {
    const pm = makeManager();
    expect(pm.saveActive()).toBeUndefined();
  });

  test('saveActive writes name and creates dir', () => {
    const pm = makeManager();
    pm.activeName = 'alice';
    pm.saveActive();
    expect(fs.readFileSync(path.join(tmpDir, '.opencode', 'active-personality.json'), 'utf8')).toBe('alice');
  });

  test('saveActive reuses existing dir', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    const pm = makeManager();
    pm.activeName = 'bob';
    pm.saveActive();
    expect(fs.readFileSync(path.join(tmpDir, '.opencode', 'active-personality.json'), 'utf8')).toBe('bob');
  });

  test('saveActive warns on write failure', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pm = makeManager();
    pm.activeName = 'alice';
    pm.activeStorePath = path.join(tmpDir, 'nested', 'no', 'file.json');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    pm.saveActive();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('createPersonality returns false for missing name or duplicate', () => {
    const pm = makeManager();
    expect(pm.createPersonality('', {})).toBe(false);
    pm.personalities.dup = {};
    expect(pm.createPersonality('dup', {})).toBe(false);
  });

  test('createPersonality stores sanitized traits', () => {
    const pm = makeManager();
    const ok = pm.createPersonality('neo', {
      name: 'Neo',
      description: 'desc',
      traits: {
        emoji: true,
        style: 'cool',
        rate: 3.0,
        playfulness: 1.5,
        formality: 'casual',
        evil: 'injected'
      },
      style: 'emoji'
    });
    expect(ok).toBe(true);
    const p = pm.personalities.neo;
    expect(p.name).toBe('Neo');
    expect(p.description).toBe('desc');
    expect(p.traits.emoji).toBe(true);
    expect(p.traits.style).toBe('cool');
    expect(p.traits.rate).toBe(2.0);
    expect(p.traits.playfulness).toBe(1.0);
    expect(p.traits.formality).toBe('casual');
    expect(p.traits).not.toHaveProperty('evil');
    expect(p.custom).toBe(true);
    expect(p.mood).toBeTruthy();
    expect(p.tts.enabled).toBe(true);
    expect(p.model.name).toBe('llama3.2');
    expect(p.routing.keywords.media).toContain('播放');
    const persisted = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    expect(persisted.personalities.neo.name).toBe('Neo');
  });

  test('createPersonality applies trait defaults', () => {
    const pm = makeManager();
    pm.createPersonality('plain', {});
    const p = pm.personalities.plain;
    expect(p.traits.emoji).toBe(true);
    expect(p.traits.style).toBe('emoji');
    expect(p.name).toBe('plain');
    expect(p.description).toBe('自定义人格');
  });

  test('createPersonality preserves explicit emoji false', () => {
    const pm = makeManager();
    pm.createPersonality('serious', { traits: { emoji: false } });
    expect(pm.personalities.serious.traits.emoji).toBe(false);
  });

  test('createPersonality clips string lengths and low/high values', () => {
    const pm = makeManager();
    pm.createPersonality('long', {
      name: 'x'.repeat(100),
      description: 'y'.repeat(300),
      traits: { style: 'z'.repeat(50), rate: 0.1, playfulness: -1 }
    });
    const p = pm.personalities.long;
    expect(p.name.length).toBe(50);
    expect(p.description.length).toBe(200);
    expect(p.traits.style.length).toBe(20);
    expect(p.traits.rate).toBe(0.5);
    expect(p.traits.playfulness).toBe(0);
  });

  test('createPersonality skips non-conforming trait values', () => {
    const pm = makeManager();
    pm.createPersonality('odd', {
      traits: { style: 123, formality: 456, rate: 'fast', playfulness: 'lots', emoji: 'yes' }
    });
    const t = pm.personalities.odd.traits;
    expect(t.style).toBe('emoji');
    expect(t.emoji).toBe(true);
    expect(t).not.toHaveProperty('formality');
    expect(t).not.toHaveProperty('rate');
    expect(t).not.toHaveProperty('playfulness');
  });

  test('deletePersonality returns false for missing or empty', () => {
    const pm = makeManager();
    expect(pm.deletePersonality('')).toBe(false);
    expect(pm.deletePersonality('ghost')).toBe(false);
  });

  test('deletePersonality removes personality and persists', () => {
    writeData({ alice: { name: 'Alice' }, bob: { name: 'Bob' } }, null);
    const pm = makeManager();
    pm.loadSync();
    expect(pm.deletePersonality('alice')).toBe(true);
    expect(pm.personalities).not.toHaveProperty('alice');
    expect(pm.personalities.bob.name).toBe('Bob');
    const persisted = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    expect(persisted.personalities).not.toHaveProperty('alice');
  });

  test('deletePersonality switches active to another when deleting active', () => {
    writeData({ alice: { name: 'Alice' }, bob: { name: 'Bob' } }, 'alice');
    const pm = makeManager();
    pm.loadSync();
    pm.deletePersonality('alice');
    expect(pm.activeName).toBe('bob');
    pm.stopMoodDrift();
  });

  test('deletePersonality leaves active null when deleting only one', () => {
    writeData({ alice: { name: 'Alice' } }, 'alice');
    const pm = makeManager();
    pm.loadSync();
    pm.deletePersonality('alice');
    expect(pm.activeName).toBeNull();
    expect(pm.active).toBeNull();
  });

  test('_persistPersonalities logs error on failure', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('missing');
    });
    const pm = makeManager();
    pm._persistPersonalities();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
