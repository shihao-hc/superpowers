/**
 * AudioPlayer - 音频文件播放系统
 * 
 * 功能:
 * - 播放RVC生成的歌曲/翻唱
 * - 音频可视化
 * - 播放队列
 * - 音效处理
 * - 均衡器
 */

class AudioPlayer {
  constructor(options = {}) {
    this.options = {
      // 默认音量
      volume: options.volume || 1.0,
      // 是否循环
      loop: options.loop || false,
      // 均衡器预设
      equalizer: options.equalizer || 'flat',
      // 可视化
      visualizer: options.visualizer !== false,
      // 回调
      onPlay: options.onPlay || null,
      onPause: options.onPause || null,
      onEnd: options.onEnd || null,
      onProgress: options.onProgress || null,
      onError: options.onError || null,
      ...options
    };

    // 音频上下文
    this.audioContext = null;
    this.analyser = null;
    this.gainNode = null;
    this.sourceNode = null;

    // 播放器
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    
    // 队列
    this.queue = [];
    this.currentIndex = -1;
    
    // 状态
    this.isPlaying = false;
    this.isPaused = false;
    
    // 均衡器预设
    this.equalizerPresets = {
      flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass: [5, 4, 3, 2, 1, 0, 0, 0, 0, 0],
      treble: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
      vocal: [-1, -1, 0, 2, 3, 3, 2, 0, -1, -1],
      pop: [1, 2, 3, 2, 1, -1, -1, 1, 2, 2],
      rock: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4],
      electronic: [4, 3, 1, 0, -1, -1, 0, 1, 3, 4]
    };

    // 统计
    this.stats = {
      totalPlays: 0,
      totalDuration: 0,
      currentTrack: null
    };

    // 初始化
    this._initAudioContext();
    this._bindEvents();
  }

  /**
   * 初始化音频上下文
   */
  _initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // 创建分析器
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      // 创建增益节点
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.options.volume;
      
      // 创建均衡器
      this._createEqualizer();
      
      // 连接节点
      this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
      this.sourceNode.connect(this.equalizer.input);
      this.equalizer.output.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
    } catch (e) {
      console.warn('[AudioPlayer] AudioContext init failed:', e);
    }
  }

  /**
   * 创建均衡器
   */
  _createEqualizer() {
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const filters = [];
    
    const input = this.audioContext.createGain();
    const output = this.audioContext.createGain();
    
    frequencies.forEach((freq, i) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      filters.push(filter);
    });

    // 连接过滤器链
    input.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    filters[filters.length - 1].connect(output);

    this.equalizer = {
      input,
      output,
      filters,
      setPreset: (preset) => {
        const values = this.equalizerPresets[preset] || this.equalizerPresets.flat;
        filters.forEach((f, i) => f.gain.value = values[i] || 0);
      },
      setGain: (index, value) => {
        if (filters[index]) {
          filters[index].gain.value = Math.max(-12, Math.min(12, value));
        }
      }
    };
  }

  /**
   * 绑定事件
   */
  _bindEvents() {
    this.audio.onplay = () => {
      this.isPlaying = true;
      this.isPaused = false;
      if (this.options.onPlay) this.options.onPlay(this.getCurrentTrack());
    };

    this.audio.onpause = () => {
      this.isPaused = true;
      if (this.options.onPause) this.options.onPause(this.getCurrentTrack());
    };

    this.audio.onended = () => {
      this.isPlaying = false;
      if (this.options.onEnd) this.options.onEnd(this.getCurrentTrack());
      this._playNext();
    };

    this.audio.ontimeupdate = () => {
      if (this.options.onProgress) {
        this.options.onProgress({
          currentTime: this.audio.currentTime,
          duration: this.audio.duration,
          progress: this.audio.duration ? this.audio.currentTime / this.audio.duration : 0
        });
      }
    };

    this.audio.onerror = (e) => {
      console.error('[AudioPlayer] Error:', e);
      if (this.options.onError) this.options.onError(e);
    };
  }

  /**
   * 播放音频文件
   */
  async play(url, options = {}) {
    // 恢复AudioContext (需要用户交互)
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.audio.src = url;
    this.audio.loop = options.loop || this.options.loop;
    this.audio.volume = options.volume || this.options.volume;
    this.audio.playbackRate = options.rate || 1;

    try {
      await this.audio.play();
      this.stats.totalPlays++;
      this.stats.currentTrack = url;
    } catch (error) {
      console.error('[AudioPlayer] Play error:', error);
      if (this.options.onError) this.options.onError(error);
    }
  }

  /**
   * 添加到队列
   */
  addToQueue(url, metadata = {}) {
    this.queue.push({ url, metadata });
  }

  /**
   * 播放队列
   */
  async playQueue(startIndex = 0) {
    if (this.queue.length === 0) return;
    
    this.currentIndex = startIndex;
    await this._playCurrent();
  }

  /**
   * 播放当前曲目
   */
  async _playCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) return;
    
    const track = this.queue[this.currentIndex];
    await this.play(track.url);
    
    if (this.options.onPlay) {
      this.options.onPlay({
        ...track,
        index: this.currentIndex,
        total: this.queue.length
      });
    }
  }

  /**
   * 播放下一首
   */
  async _playNext() {
    if (!this.options.loop && this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      await this._playCurrent();
    }
  }

  /**
   * 上一首
   */
  async previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      await this._playCurrent();
    }
  }

  /**
   * 下一首
   */
  async next() {
    if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      await this._playCurrent();
    }
  }

  /**
   * 暂停
   */
  pause() {
    this.audio.pause();
  }

  /**
   * 恢复
   */
  resume() {
    this.audio.play();
  }

  /**
   * 停止
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    this.isPaused = false;
  }

  /**
   * 跳转
   */
  seek(time) {
    if (typeof time === 'string') {
      // 解析 "1:30" 格式
      const parts = time.split(':');
      time = parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
    }
    this.audio.currentTime = time;
  }

  /**
   * 设置音量
   */
  setVolume(volume) {
    this.options.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.options.volume;
    }
    this.audio.volume = this.options.volume;
  }

  /**
   * 设置均衡器
   */
  setEqualizer(preset) {
    if (this.equalizer) {
      this.equalizer.setPreset(preset);
    }
  }

  /**
   * 获取可视化数据
   */
  getVisualizerData() {
    if (!this.analyser) return null;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    return {
      frequency: Array.from(dataArray),
      waveform: this.getWaveformData(),
      volume: this.getVolume()
    };
  }

  /**
   * 获取波形数据
   */
  getWaveformData() {
    if (!this.analyser) return null;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    return Array.from(dataArray);
  }

  /**
   * 获取音量
   */
  getVolume() {
    if (!this.analyser) return 0;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / dataArray.length / 255;
  }

  /**
   * 获取当前曲目
   */
  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return {
        ...this.queue[this.currentIndex],
        index: this.currentIndex,
        total: this.queue.length,
        currentTime: this.audio.currentTime,
        duration: this.audio.duration
      };
    }
    return {
      url: this.audio.src,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration
    };
  }

  /**
   * 渲染可视化器
   */
  renderVisualizer(canvas, options = {}) {
    if (!canvas || !this.analyser) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const draw = () => {
      requestAnimationFrame(draw);
      
      const data = this.getVisualizerData();
      if (!data) return;

      // 清除画布
      ctx.fillStyle = options.background || 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, 0, width, height);

      const barCount = options.barCount || 64;
      const barWidth = width / barCount;
      const step = Math.floor(data.frequency.length / barCount);

      // 绘制频谱条
      for (let i = 0; i < barCount; i++) {
        const value = data.frequency[i * step];
        const barHeight = (value / 255) * height;
        
        // 渐变颜色
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, options.colorStart || '#667eea');
        gradient.addColorStop(1, options.colorEnd || '#764ba2');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(
          i * barWidth + 1,
          height - barHeight,
          barWidth - 2,
          barHeight
        );
      }
    };

    draw();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      currentIndex: this.currentIndex,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused
    };
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop();
    this.queue = [];
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

if (typeof window !== 'undefined') {
  window.AudioPlayer = AudioPlayer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioPlayer;
}
