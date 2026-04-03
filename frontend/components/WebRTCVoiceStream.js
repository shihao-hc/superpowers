/**
 * WebRTCVoiceStream - WebRTC低延迟语音流管道
 * 
 * 功能:
 * - 低延迟双向语音通话
 * - 音频流传输到服务器
 * - 实时语音识别(ASR)
 * - 自定义语音合成(TTS)
 */

class WebRTCVoiceStream {
  constructor(options = {}) {
    this.options = {
      signalingUrl: options.signalingUrl || 'wss://your-server.com/ws',
      audioConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      },
      codec: 'opus',
      bitrate: 128000,
      ...options
    };
    
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.remoteStream = null;
    
    this.audioContext = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    this.isConnected = false;
    this.isConnecting = false;
    
    this.onConnectionStateChange = options.onConnectionStateChange || (() => {});
    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onAudioData = options.onAudioData || (() => {});
    this.onError = options.onError || (() => {});
    
    this.ws = null;
    this.clientId = null;
  }

  async initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.options.audioConstraints.sampleRate
      });
      
      console.log('[WebRTC] AudioContext initialized');
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to initialize:', error);
      return false;
    }
  }

  async startCapture() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.audioConstraints
      });
      
      console.log('[WebRTC] Local audio captured');
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to capture audio:', error);
      this.onError('Failed to access microphone');
      return false;
    }
  }

  async connect() {
    if (this.isConnecting || this.isConnected) return;
    
    this.isConnecting = true;
    
    try {
      await this.startCapture();
      
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      this._setupPeerConnectionHandlers();
      this._setupDataChannel();
      
      const audioTracks = this.localStream.getAudioTracks();
      this.peerConnection.addTrack(audioTracks[0], this.localStream);
      
      await this._connectSignaling();
      
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      await this.peerConnection.setLocalDescription(offer);
      
      this._sendSignaling({ type: 'offer', sdp: offer.sdp });
      
      this.isConnecting = false;
      this.isConnected = true;
      
      console.log('[WebRTC] Connection initiated');
      return true;
    } catch (error) {
      console.error('[WebRTC] Connection failed:', error);
      this.isConnecting = false;
      this.onError('Connection failed');
      return false;
    }
  }

  _setupPeerConnectionHandlers() {
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignaling({ type: 'ice-candidate', candidate: event.candidate });
      }
    };
    
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream(this.remoteStream);
    };
    
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTC] Connection state:', state);
      this.onConnectionStateChange(state);
      
      if (state === 'failed' || state === 'disconnected') {
        this._handleDisconnect();
      }
    };
    
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._setupDataChannelHandlers();
    };
  }

  _setupDataChannel() {
    this.dataChannel = this.peerConnection.createDataChannel('voice', {
      ordered: true
    });
    this._setupDataChannelHandlers();
  }

  _setupDataChannelHandlers() {
    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
      this._startAudioCapture();
    };
    
    this.dataChannel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };
    
    this.dataChannel.onerror = (error) => {
      console.error('[WebRTC] Data channel error:', error);
    };
  }

  async _connectSignaling() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.signalingUrl);
      
      this.ws.onopen = () => {
        console.log('[WebRTC] Signaling connected');
        resolve();
      };
      
      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this._handleSignalingMessage(data);
        } catch (e) {
          console.error('[WebRTC] Signaling parse error:', e);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[WebRTC] Signaling error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('[WebRTC] Signaling closed');
        this._handleDisconnect();
      };
    });
  }

  _sendSignaling(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async _handleSignalingMessage(data) {
    switch (data.type) {
      case 'offer':
        await this._handleOffer(data);
        break;
      case 'answer':
        await this._handleAnswer(data);
        break;
      case 'ice-candidate':
        await this._handleIceCandidate(data);
        break;
      case 'client-id':
        this.clientId = data.clientId;
        break;
    }
  }

  async _handleOffer(data) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: data.sdp
      }));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this._sendSignaling({ type: 'answer', sdp: answer.sdp });
    } catch (error) {
      console.error('[WebRTC] Handle offer failed:', error);
    }
  }

  async _handleAnswer(data) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: data.sdp
      }));
    } catch (error) {
      console.error('[WebRTC] Handle answer failed:', error);
    }
  }

  async _handleIceCandidate(data) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('[WebRTC] Add ICE candidate failed:', error);
    }
  }

  _startAudioCapture() {
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (event) => {
      if (!this.isConnected) return;
      
      const inputData = event.inputBuffer.getChannelData(0);
      const pcmData = this._convertToPCM16(inputData);
      
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(pcmData);
      }
      
      this.onAudioData(inputData);
    };
    
    source.connect(processor);
    processor.connect(this.audioContext.destination);
    
    console.log('[WebRTC] Audio capture started');
  }

  _convertToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return pcm16.buffer;
  }

  _handleDataChannelMessage(data) {
    if (data instanceof ArrayBuffer) {
      this._playAudioChunk(data);
    } else if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        this._handleControlMessage(message);
      } catch (e) {}
    }
  }

  _handleControlMessage(message) {
    switch (message.type) {
      case 'transcript':
        if (this.onTranscript) {
          this.onTranscript(message.text, message.isFinal);
        }
        break;
      case 'tts':
        if (this.onTTS) {
          this.onTTS(message.text, message.emotion);
        }
        break;
    }
  }

  async _playAudioChunk(pcmBuffer) {
    try {
      const int16Array = new Int16Array(pcmBuffer);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 0x8000;
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(
        this._float32ToArrayBuffer(float32Array)
      );
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (error) {
      console.error('[WebRTC] Audio playback error:', error);
    }
  }

  _float32ToArrayBuffer(float32Array) {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + float32Array.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, this.audioContext.sampleRate, true);
    view.setUint32(28, this.audioContext.sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, float32Array.length * 2, true);
    
    const dataOffset = 44;
    for (let i = 0; i < float32Array.length; i++) {
      view.setInt16(dataOffset + i * 2, float32Array[i] * 0x7FFF, true);
    }
    
    return buffer;
  }

  sendTranscript(text, isFinal = true) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'transcript',
        text,
        isFinal
      }));
    }
  }

  sendTTS(text, emotion = 'neutral') {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'request-tts',
        text,
        emotion
      }));
    }
  }

  _handleDisconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    
    this.onConnectionStateChange('disconnected');
  }

  async disconnect() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    
    console.log('[WebRTC] Disconnected');
  }

  setTranscriptHandler(handler) {
    this.onTranscript = handler;
  }

  setTTSHandler(handler) {
    this.onTTS = handler;
  }

  getConnectionState() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      peerState: this.peerConnection?.connectionState || 'new',
      dataChannelState: this.dataChannel?.readyState || 'closed'
    };
  }
}

/**
 * VoiceActivityDetector - 语音活动检测
 */
class VoiceActivityDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.02;
    this.silenceThreshold = options.silenceThreshold || 0.01;
    this.speechTimeout = options.speechTimeout || 300;
    this.silenceTimeout = options.silenceTimeout || 500;
    
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    this.silenceTimer = null;
  }

  initialize(audioContext) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
  }

  processAudioData(audioData) {
    if (!this.analyser) return;
    
    const timeData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(timeData);
    
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const normalized = (timeData[i] - 128) / 128;
      sum += normalized * normalized;
    }
    
    const rms = Math.sqrt(sum / timeData.length);
    
    if (rms > this.threshold) {
      this._handleSpeech();
    } else if (rms < this.silenceThreshold) {
      this._handleSilence();
    }
  }

  _handleSpeech() {
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.speechStartTime = Date.now();
      this.onSpeechStart();
    }
    
    this.lastSpeechTime = Date.now();
    
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    this.silenceTimer = setTimeout(() => {
      if (this.isSpeaking && Date.now() - this.lastSpeechTime > this.silenceTimeout) {
        this._endSpeech();
      }
    }, this.silenceTimeout);
  }

  _handleSilence() {
    if (this.isSpeaking && Date.now() - this.lastSpeechTime > this.speechTimeout) {
      this._endSpeech();
    }
  }

  _endSpeech() {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.onSpeechEnd(Date.now() - this.lastSpeechTime);
  }

  reset() {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}

/**
 * AudioStreamProcessor - 音频流处理器
 */
class AudioStreamProcessor {
  constructor(options = {}) {
    this.audioContext = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.compressor = null;
    
    this.gain = options.gain || 1.0;
    this.isProcessing = false;
  }

  initialize(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.gain;
    
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.compressor);
    
    this.isProcessing = true;
    return this.compressor;
  }

  setGain(value) {
    this.gain = value;
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  getProcessedStream() {
    if (!this.compressor) return null;
    
    const dest = this.audioContext.createMediaStreamDestination();
    this.compressor.connect(dest);
    return dest.stream;
  }

  disconnect() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.compressor) {
      this.compressor.disconnect();
    }
    
    this.isProcessing = false;
  }
}

if (typeof window !== 'undefined') {
  window.WebRTCVoiceStream = WebRTCVoiceStream;
  window.VoiceActivityDetector = VoiceActivityDetector;
  window.AudioStreamProcessor = AudioStreamProcessor;
}

if (typeof module !== 'undefined') {
  module.exports = {
    WebRTCVoiceStream,
    VoiceActivityDetector,
    AudioStreamProcessor
  };
}
