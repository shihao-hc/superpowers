'use strict';

const FingerprintIsolator = require('../../src/agent/FingerprintIsolator');

describe('FingerprintIsolator', () => {
  let isolator;

  beforeEach(() => {
    isolator = new FingerprintIsolator({ seed: 'test-seed-abc' });
  });

  describe('constructor', () => {
    it('defaults all protections to true', () => {
      const i = new FingerprintIsolator();
      expect(i.canvasNoise).toBe(true);
      expect(i.webglNoise).toBe(true);
      expect(i.audioNoise).toBe(true);
      expect(i.webrtcBlock).toBe(true);
      expect(i.fontFingerprint).toBe(true);
    });

    it('allows disabling individual protections', () => {
      const i = new FingerprintIsolator({
        canvasNoise: false,
        webglNoise: false,
        audioNoise: false,
        webrtcBlock: false,
        fontFingerprint: false
      });
      expect(i.canvasNoise).toBe(false);
      expect(i.webglNoise).toBe(false);
      expect(i.audioNoise).toBe(false);
      expect(i.webrtcBlock).toBe(false);
      expect(i.fontFingerprint).toBe(false);
    });

    it('stores spoof options', () => {
      const i = new FingerprintIsolator({
        timezoneSpoof: 'Asia/Shanghai',
        languageSpoof: 'zh-CN',
        platformSpoof: 'Linux'
      });
      expect(i.timezoneSpoof).toBe('Asia/Shanghai');
      expect(i.languageSpoof).toBe('zh-CN');
      expect(i.platformSpoof).toBe('Linux');
    });

    it('defaults spoof options to null', () => {
      expect(isolator.timezoneSpoof).toBeNull();
      expect(isolator.languageSpoof).toBeNull();
      expect(isolator.platformSpoof).toBeNull();
    });

    it('generates random seed when none provided', () => {
      const i = new FingerprintIsolator();
      expect(i._seed).toBeDefined();
      expect(i._seed.length).toBeGreaterThan(0);
    });

    it('uses provided seed', () => {
      expect(isolator._seed).toBe('test-seed-abc');
    });

    it('initializes empty noise cache and hooks', () => {
      expect(isolator._noiseCache).toBeInstanceOf(Map);
      expect(isolator._noiseCache.size).toBe(0);
      expect(isolator._hooks).toEqual([]);
    });
  });

  describe('_simpleHash', () => {
    it('returns deterministic hash for same input', () => {
      const h1 = isolator._simpleHash('hello');
      const h2 = isolator._simpleHash('hello');
      expect(h1).toBe(h2);
    });

    it('returns different hash for different inputs', () => {
      const h1 = isolator._simpleHash('hello');
      const h2 = isolator._simpleHash('world');
      expect(h1).not.toBe(h2);
    });

    it('returns a number', () => {
      const h = isolator._simpleHash('test');
      expect(typeof h).toBe('number');
      expect(h).toBeGreaterThanOrEqual(0);
    });

    it('handles empty string', () => {
      const h = isolator._simpleHash('');
      expect(typeof h).toBe('number');
    });

    it('handles long strings', () => {
      const long = 'a'.repeat(1000);
      const h = isolator._simpleHash(long);
      expect(typeof h).toBe('number');
    });
  });

  describe('_generateNoise', () => {
    it('returns deterministic noise for same seed+key', () => {
      const n1 = isolator._generateNoise('canvas', 1);
      const n2 = isolator._generateNoise('canvas', 1);
      expect(n1).toBe(n2);
    });

    it('returns different noise for different keys', () => {
      const n1 = isolator._generateNoise('canvas', 1);
      const n2 = isolator._generateNoise('webgl', 1);
      expect(n1).not.toBe(n2);
    });

    it('returns values within range', () => {
      for (let i = 0; i < 20; i++) {
        const noise = isolator._generateNoise('key' + i, 2);
        expect(noise).toBeGreaterThanOrEqual(-1);
        expect(noise).toBeLessThanOrEqual(1);
      }
    });

    it('caches noise values', () => {
      const n1 = isolator._generateNoise('cached', 5);
      expect(isolator._noiseCache.has('cached')).toBe(true);
      expect(isolator._noiseCache.get('cached')).toBe(n1);
    });

    it('uses default range of 1', () => {
      const noise = isolator._generateNoise('default-range');
      expect(noise).toBeGreaterThanOrEqual(-0.5);
      expect(noise).toBeLessThanOrEqual(0.5);
    });

    it('respects larger ranges', () => {
      const noise = isolator._generateNoise('big-range', 10);
      expect(noise).toBeGreaterThanOrEqual(-5);
      expect(noise).toBeLessThanOrEqual(5);
    });
  });

  describe('getFingerprint', () => {
    it('returns current configuration state', () => {
      const fp = isolator.getFingerprint();
      expect(fp.seed).toBe('test-seed-abc');
      expect(fp.canvas).toBe(true);
      expect(fp.webgl).toBe(true);
      expect(fp.audio).toBe(true);
      expect(fp.webrtc).toBe(true);
      expect(fp.timezone).toBeNull();
      expect(fp.language).toBeNull();
      expect(fp.platform).toBeNull();
    });

    it('reflects current spoof values', () => {
      const i = new FingerprintIsolator({
        seed: 's2',
        timezoneSpoof: 'UTC',
        languageSpoof: 'en',
        platformSpoof: 'Mac'
      });
      const fp = i.getFingerprint();
      expect(fp.timezone).toBe('UTC');
      expect(fp.language).toBe('en');
      expect(fp.platform).toBe('Mac');
    });
  });

  describe('generateNewSeed', () => {
    it('changes the seed', () => {
      const oldSeed = isolator._seed;
      isolator.generateNewSeed();
      expect(isolator._seed).not.toBe(oldSeed);
    });

    it('returns the new seed', () => {
      const newSeed = isolator.generateNewSeed();
      expect(newSeed).toBe(isolator._seed);
    });

    it('clears the noise cache', () => {
      isolator._generateNoise('some-key', 1);
      expect(isolator._noiseCache.size).toBe(1);
      isolator.generateNewSeed();
      expect(isolator._noiseCache.size).toBe(0);
    });

    it('generates a seed string', () => {
      const newSeed = isolator.generateNewSeed();
      expect(newSeed.length).toBeGreaterThan(0);
    });
  });

  describe('remove', () => {
    it('clears all hooks', () => {
      const cleanup = jest.fn();
      isolator._hooks.push(cleanup);
      isolator._hooks.push(cleanup);
      expect(isolator._hooks.length).toBe(2);
      isolator.remove();
      expect(isolator._hooks.length).toBe(0);
    });

    it('executes each hook', () => {
      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      isolator._hooks.push(cleanup1, cleanup2);
      isolator.remove();
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('catches errors from failing hooks', () => {
      const badHook = () => { throw new Error('hook error'); };
      const goodHook = jest.fn();
      isolator._hooks.push(badHook, goodHook);
      expect(() => isolator.remove()).not.toThrow();
      expect(goodHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('_addCanvasNoise (static)', () => {
    it('modifies pixel data in place', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const data = new Uint8ClampedArray([100, 150, 200, 255, 50, 60, 70, 255]);
      const imageData = { data };
      FingerprintIsolator._addCanvasNoise(imageData, 2, 1);
      expect(data[0]).not.toBe(100);
      Math.random.mockRestore();
    });

    it('clamps values to [0, 255]', () => {
      const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
      const imageData = { data };
      FingerprintIsolator._addCanvasNoise(imageData, 2, 1);
      for (let i = 0; i < 8; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
      }
    });

    it('only modifies RGB channels, not alpha', () => {
      const data = new Uint8ClampedArray([128, 128, 128, 255, 64, 64, 64, 128]);
      const originalAlpha1 = data[3];
      const originalAlpha2 = data[7];
      const imageData = { data };
      FingerprintIsolator._addCanvasNoise(imageData, 2, 1);
      expect(data[3]).toBe(originalAlpha1);
      expect(data[7]).toBe(originalAlpha2);
    });

    it('preserves alpha value of 0', () => {
      const data = new Uint8ClampedArray([100, 100, 100, 0]);
      const imageData = { data };
      FingerprintIsolator._addCanvasNoise(imageData, 1, 1);
      expect(data[3]).toBe(0);
    });
  });

  describe('apply', () => {
    it('returns early when window is undefined', () => {
      const hookSpy = jest.spyOn(isolator, '_hookCanvas');
      isolator.apply();
      expect(hookSpy).not.toHaveBeenCalled();
      hookSpy.mockRestore();
    });
  });

  describe('browser hooks', () => {
    let origWindow;
    const mockGetContext = jest.fn();
    const mockGetImageData = jest.fn();
    const mockPutImageData = jest.fn();
    const mockToDataURL = jest.fn(() => 'data:original');
    const mockToBlob = jest.fn((cb) => cb(null));
    const mockGetParameter = jest.fn();
    const mockGetExtension = jest.fn();
    const mockCreateOscillator = jest.fn();
    const mockCreateAnalyser = jest.fn();
    const mockGetFloatFrequencyData = jest.fn();

    beforeEach(() => {
      origWindow = global.window;
      global.window = {
        RTCPeerConnection: class {},
        navigator: {
          mediaDevices: {
            getUserMedia: jest.fn()
          }
        }
      };
      global.navigator = {
        language: 'en-US',
        languages: ['en-US'],
        platform: 'Win32',
        mediaDevices: {
          getUserMedia: jest.fn()
        }
      };
      global.HTMLCanvasElement = class {
        constructor() {
          this.width = 100;
          this.height = 50;
        }
        getContext() { return mockGetContext(); }
      };
      HTMLCanvasElement.prototype.toDataURL = mockToDataURL;
      HTMLCanvasElement.prototype.toBlob = mockToBlob;
      global.CanvasRenderingContext2D = class {};
      CanvasRenderingContext2D.prototype.getImageData = mockGetImageData;
      global.WebGLRenderingContext = class {};
      WebGLRenderingContext.prototype.getParameter = mockGetParameter;
      WebGLRenderingContext.prototype.getExtension = mockGetExtension;
      global.WebGL2RenderingContext = class {};
      global.AudioContext = class {};
      AudioContext.prototype.createOscillator = mockCreateOscillator;
      AudioContext.prototype.createAnalyser = mockCreateAnalyser;
    });

    afterEach(() => {
      global.window = origWindow;
      delete global.navigator;
      delete global.HTMLCanvasElement;
      delete global.CanvasRenderingContext2D;
      delete global.WebGLRenderingContext;
      delete global.WebGL2RenderingContext;
      delete global.AudioContext;
    });

    describe('_hookCanvas', () => {
      it('replaces toDataURL and registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._hookCanvas();
        expect(typeof HTMLCanvasElement.prototype.toDataURL).toBe('function');
        expect(HTMLCanvasElement.prototype.toDataURL).not.toBe(mockToDataURL);
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });

      it('replaces toBlob and registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._hookCanvas();
        expect(typeof HTMLCanvasElement.prototype.toBlob).toBe('function');
        expect(HTMLCanvasElement.prototype.toBlob).not.toBe(mockToBlob);
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });
    });

    describe('_hookWebGL', () => {
      it('replaces getParameter on WebGLRenderingContext', () => {
        isolator._hookWebGL();
        const result = WebGLRenderingContext.prototype.getParameter(37445);
        expect(result).toBe('NVIDIA Corporation');
      });

      it('returns original getParameter for unknown params', () => {
        mockGetParameter.mockReturnValue('original');
        isolator._hookWebGL();
        const result = WebGLRenderingContext.prototype.getParameter(99999);
        expect(result).toBe('original');
      });

      it('aliases WebGL2RenderingContext.getParameter', () => {
        isolator._hookWebGL();
        expect(WebGL2RenderingContext.prototype.getParameter)
          .toBe(WebGLRenderingContext.prototype.getParameter);
      });

      it('registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._hookWebGL();
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });
    });

    describe('_spoofTimezone', () => {
      it('replaces Intl.DateTimeFormat', () => {
        const orig = Intl.DateTimeFormat;
        isolator._spoofTimezone();
        expect(Intl.DateTimeFormat).not.toBe(orig);
      });

      it('registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._spoofTimezone();
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });
    });

    describe('_spoofLanguage', () => {
      it('overrides navigator.language', () => {
        isolator.languageSpoof = 'zh-CN';
        isolator._spoofLanguage();
        expect(Object.getOwnPropertyDescriptor(navigator, 'language').get()).toBe('zh-CN');
        expect(Object.getOwnPropertyDescriptor(navigator, 'languages').get()).toEqual(['zh-CN']);
      });

      it('defaults to en-US when no spoof set', () => {
        isolator._spoofLanguage();
        expect(Object.getOwnPropertyDescriptor(navigator, 'language').get()).toBe('en-US');
        expect(Object.getOwnPropertyDescriptor(navigator, 'languages').get()).toEqual(['en-US']);
      });
    });

    describe('_spoofPlatform', () => {
      it('overrides navigator.platform', () => {
        isolator.platformSpoof = 'Linux x86_64';
        isolator._spoofPlatform();
        expect(Object.getOwnPropertyDescriptor(navigator, 'platform').get()).toBe('Linux x86_64');
      });

      it('defaults to Win32 when no spoof set', () => {
        isolator._spoofPlatform();
        expect(Object.getOwnPropertyDescriptor(navigator, 'platform').get()).toBe('Win32');
      });
    });

    describe('_blockWebRTC', () => {
      it('replaces RTCPeerConnection with throwing stub', () => {
        isolator._blockWebRTC();
        expect(() => new window.RTCPeerConnection()).toThrow('WebRTC is disabled');
      });

      it('replaces getUserMedia with rejecting stub', async () => {
        isolator._blockWebRTC();
        await expect(navigator.mediaDevices.getUserMedia()).rejects.toThrow('Media devices blocked');
      });

      it('registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._blockWebRTC();
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });
    });

    describe('_hookAudio', () => {
      it('replaces createAnalyser and registers cleanup hook', () => {
        const hookCount = isolator._hooks.length;
        isolator._hookAudio();
        expect(AudioContext.prototype.createAnalyser).not.toBe(mockCreateAnalyser);
        expect(isolator._hooks.length).toBe(hookCount + 1);
      });
    });

    describe('apply with browser globals', () => {
      it('calls all enabled hooks', () => {
        const canvasSpy = jest.spyOn(isolator, '_hookCanvas');
        const webglSpy = jest.spyOn(isolator, '_hookWebGL');
        const audioSpy = jest.spyOn(isolator, '_hookAudio');
        const webrtcSpy = jest.spyOn(isolator, '_blockWebRTC');
        isolator.apply();
        expect(canvasSpy).toHaveBeenCalled();
        expect(webglSpy).toHaveBeenCalled();
        expect(audioSpy).toHaveBeenCalled();
        expect(webrtcSpy).toHaveBeenCalled();
      });

      it('skips disabled protections', () => {
        const i = new FingerprintIsolator({ seed: 's', canvasNoise: false, webglNoise: false });
        const canvasSpy = jest.spyOn(i, '_hookCanvas');
        const webglSpy = jest.spyOn(i, '_hookWebGL');
        i.apply();
        expect(canvasSpy).not.toHaveBeenCalled();
        expect(webglSpy).not.toHaveBeenCalled();
      });

      it('calls spoof methods when configured', () => {
        const i = new FingerprintIsolator({
          seed: 's',
          timezoneSpoof: 'UTC',
          languageSpoof: 'en',
          platformSpoof: 'Mac'
        });
        const tzSpy = jest.spyOn(i, '_spoofTimezone');
        const langSpy = jest.spyOn(i, '_spoofLanguage');
        const platSpy = jest.spyOn(i, '_spoofPlatform');
        i.apply();
        expect(tzSpy).toHaveBeenCalled();
        expect(langSpy).toHaveBeenCalled();
        expect(platSpy).toHaveBeenCalled();
      });
    });

    describe('canvas noise injection', () => {
      beforeEach(() => {
        jest.restoreAllMocks();
      });

      it('injects noise via toDataURL when canvas has valid context', () => {
        mockGetContext.mockReturnValue({ putImageData: mockPutImageData });
        const imageData = { data: new Uint8ClampedArray(20000) };
        mockGetImageData.mockReturnValue(imageData);

        isolator._hookCanvas();
        const addSpy = jest.spyOn(FingerprintIsolator, '_addCanvasNoise');

        new HTMLCanvasElement().toDataURL();

        expect(addSpy).toHaveBeenCalledWith(imageData, 100, 50);
        expect(mockPutImageData).toHaveBeenCalledWith(imageData, 0, 0);

        addSpy.mockRestore();
      });

      it('injects noise via toBlob when canvas has valid context', () => {
        mockGetContext.mockReturnValue({ putImageData: mockPutImageData });
        const imageData = { data: new Uint8ClampedArray(20000) };
        mockGetImageData.mockReturnValue(imageData);

        isolator._hookCanvas();
        const addSpy = jest.spyOn(FingerprintIsolator, '_addCanvasNoise');

        new HTMLCanvasElement().toBlob(jest.fn());

        expect(addSpy).toHaveBeenCalledWith(imageData, 100, 50);
        expect(mockPutImageData).toHaveBeenCalledWith(imageData, 0, 0);

        addSpy.mockRestore();
      });

      it('skips noise in toDataURL when context is null', () => {
        mockGetContext.mockReturnValue(null);
        const addSpy = jest.spyOn(FingerprintIsolator, '_addCanvasNoise');

        isolator._hookCanvas();
        new HTMLCanvasElement().toDataURL();

        expect(addSpy).not.toHaveBeenCalled();

        addSpy.mockRestore();
      });

      it('skips noise in toDataURL when canvas has zero width', () => {
        mockGetContext.mockReturnValue({ putImageData: mockPutImageData });
        mockGetImageData.mockReturnValue({ data: new Uint8ClampedArray(0) });
        const addSpy = jest.spyOn(FingerprintIsolator, '_addCanvasNoise');

        isolator._hookCanvas();
        const canvas = new HTMLCanvasElement();
        canvas.width = 0;
        canvas.toDataURL();

        expect(addSpy).not.toHaveBeenCalled();

        addSpy.mockRestore();
      });

      it('restores original canvas methods on remove', () => {
        const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        const origToBlob = HTMLCanvasElement.prototype.toBlob;

        isolator._hookCanvas();
        expect(HTMLCanvasElement.prototype.toDataURL).not.toBe(origToDataURL);
        expect(HTMLCanvasElement.prototype.toBlob).not.toBe(origToBlob);

        isolator.remove();
        expect(HTMLCanvasElement.prototype.toDataURL).toBe(origToDataURL);
        expect(HTMLCanvasElement.prototype.toBlob).toBe(origToBlob);
      });
    });

    describe('WebGL cleanup', () => {
      beforeEach(() => {
        jest.restoreAllMocks();
      });

      it('restores original getParameter on remove', () => {
        const orig = WebGLRenderingContext.prototype.getParameter;

        isolator._hookWebGL();
        expect(WebGLRenderingContext.prototype.getParameter).not.toBe(orig);

        isolator.remove();
        expect(WebGLRenderingContext.prototype.getParameter).toBe(orig);
        expect(WebGL2RenderingContext.prototype.getParameter).toBe(orig);
      });
    });

    describe('audio analyser noise', () => {
      beforeEach(() => {
        jest.restoreAllMocks();
      });

      it('injects noise into getFloatFrequencyData', () => {
        const mockAnalyser = { getFloatFrequencyData: mockGetFloatFrequencyData };
        mockCreateAnalyser.mockReturnValue(mockAnalyser);

        isolator._hookAudio();
        const analyser = new AudioContext().createAnalyser();

        const array = new Float32Array([0.5, 0.25, 0, -0.25]);
        analyser.getFloatFrequencyData(array);

        expect(mockGetFloatFrequencyData).toHaveBeenCalledWith(array);
        expect(array[0]).not.toBe(0.5);
        expect(array[1]).not.toBe(0.25);
      });

      it('restores original audio methods on remove', () => {
        const origOsc = AudioContext.prototype.createOscillator;
        const origAnalyser = AudioContext.prototype.createAnalyser;

        isolator._hookAudio();
        expect(AudioContext.prototype.createAnalyser).not.toBe(origAnalyser);

        isolator.remove();
        expect(AudioContext.prototype.createOscillator).toBe(origOsc);
        expect(AudioContext.prototype.createAnalyser).toBe(origAnalyser);
      });
    });

    describe('WebRTC edge cases', () => {
      it('restores original WebRTC functions on remove', () => {
        const origRTCPC = window.RTCPeerConnection;
        const origGUM = navigator.mediaDevices.getUserMedia;

        isolator._blockWebRTC();
        isolator.remove();

        expect(window.RTCPeerConnection).toBe(origRTCPC);
        expect(navigator.mediaDevices.getUserMedia).toBe(origGUM);
      });

      it('handles missing navigator.mediaDevices gracefully', () => {
        delete navigator.mediaDevices;
        const origRTCPC = window.RTCPeerConnection;

        isolator._blockWebRTC();
        expect(navigator.mediaDevices).toBeDefined();
        expect(typeof navigator.mediaDevices.getUserMedia).toBe('function');

        isolator.remove();
        expect(window.RTCPeerConnection).toBe(origRTCPC);
      });
    });

    describe('timezone spoof function', () => {
      it('adds UTC timeZone when none provided', () => {
        const origDTF = Intl.DateTimeFormat;
        isolator._spoofTimezone();

        const dtf = new Intl.DateTimeFormat('en');
        expect(dtf.resolvedOptions().timeZone).toBe('UTC');

        isolator.remove();
        Intl.DateTimeFormat = origDTF;
      });

      it('preserves existing timeZone in DateTimeFormat', () => {
        const origDTF = Intl.DateTimeFormat;
        isolator._spoofTimezone();

        const dtf = new Intl.DateTimeFormat('en', { timeZone: 'America/New_York' });
        expect(dtf.resolvedOptions().timeZone).toBe('America/New_York');

        isolator.remove();
        Intl.DateTimeFormat = origDTF;
      });

      it('restores original DateTimeFormat on remove', () => {
        const origDTF = Intl.DateTimeFormat;
        isolator._spoofTimezone();
        expect(Intl.DateTimeFormat).not.toBe(origDTF);

        isolator.remove();
        expect(Intl.DateTimeFormat).toBe(origDTF);
      });
    });

    describe('noise params coverage', () => {
      it('returns spoofed values for all known WebGL params', () => {
        isolator._hookWebGL();

        expect(WebGLRenderingContext.prototype.getParameter(37446)).toBe('NVIDIA GeForce RTX 3080/PCIe/SSE2');
        expect(WebGLRenderingContext.prototype.getParameter(35661)).toBe(32);
        expect(WebGLRenderingContext.prototype.getParameter(34076)).toBe(16384);
        expect(WebGLRenderingContext.prototype.getParameter(34024)).toBe(16384);
        expect(WebGLRenderingContext.prototype.getParameter(34930)).toBe(16);
        expect(WebGLRenderingContext.prototype.getParameter(35724)).toBe(4600);
      });
    });
  });
});
