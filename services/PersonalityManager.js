const fs = require('fs')
const path = require('path')

class PersonalityManager {
  constructor() {
    this.configPath = path.join(__dirname, '..', 'data', 'personalities.json')
    this.load()
    this.startMoodDrift()
  }

  load() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8')
      const cfg = JSON.parse(data)
      this.active = cfg.active
      this.personalities = cfg.personalities
      this.current = this.personalities[this.active]
      this.mood = this.current && this.current.mood ? this.current.mood : { enabled: true, default: 'happy', drift: 0.2 }
      // internal mood score: 0=sad, 1=neutral, 2=happy
      this.moodScore = 2
      if (this.mood && this.mood.default) {
        const map = { 'sad': 0, 'neutral': 1, 'happy': 2 }
        this.moodScore = map[this.mood.default] ?? 2
      }
      this.currentMood = this.mood?.default ?? 'happy'
    } catch (e) {
      console.error('[PersonalityManager] load failed', e)
      // fallback minimal
      this.active = '狐九'
      this.personalities = {}
      this.current = { name: '狐九', description: '默认性格' }
      this.currentMood = 'happy'
      this.moodScore = 2
    }
  }

  setActive(name) {
    if (!this.personalities || !this.personalities[name]) return
    this.active = name
    this.current = this.personalities[name]
    this.currentMood = this.current?.mood?.default ?? 'happy'
  }

  startMoodDrift() {
    // drift every 10 seconds
    setInterval(() => this.driftMood(), 10000)
  }

  driftMood() {
    const drift = (this.current?.mood?.drift ?? 0.2)
    // small random walk
    const delta = (Math.random() * 2 - 1) * drift
    this.moodScore += delta
    if (this.moodScore < 0) this.moodScore = 0
    if (this.moodScore > 2) this.moodScore = 2
    const idx = Math.round(this.moodScore)
    this.currentMood = ['sad','neutral','happy'][idx]
  }

  getCurrentPersonality() {
    const mood = { ...this.current.mood, current: this.currentMood }
    return { ...this.current, mood }
  }

  getSystemPrompt() {
    const p = this.getCurrentPersonality()
    let prompt = `System: ${p.name} - ${p.description}. `
    if (p.traits) {
      prompt += ` Traits: emoji=${p.traits.emoji}, slang=${p.traits.slangIntensity}.`
    }
    prompt += ` Mood: ${p.mood.current}.`
    return prompt
  }

  applyPersonality(text) {
    const p = this.getCurrentPersonality()
    let out = text
    if (p.mood?.current === 'happy' && p.traits?.emoji) {
      out += ' (￣︶￣)☆'
    }
    if (p.traits?.slangIntensity && p.traits.sl angIntensity > 0.5) {}
    // add some simple emoji suffix based on mood
    const suffix = p.mood?.current === 'happy' ? ' ✨' : p.mood?.current === 'sad' ? ' 😢' : ' 🙂'
    return out + suffix
  }
}

module.exports = new PersonalityManager()
