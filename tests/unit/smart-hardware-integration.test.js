const { SmartHardwareIntegration } = require('../../src/hardware/SmartHardwareIntegration');

jest.useFakeTimers();

describe('SmartHardwareIntegration', () => {
  let hw;

  beforeEach(() => {
    hw = new SmartHardwareIntegration();
  });

  describe('constructor', () => {
    it('initializes empty Maps and Set', () => {
      expect(hw.devices).toBeInstanceOf(Map);
      expect(hw.devices.size).toBe(0);
      expect(hw.meetings).toBeInstanceOf(Map);
      expect(hw.meetings.size).toBe(0);
      expect(hw.transcriptionJobs).toBeInstanceOf(Map);
      expect(hw.transcriptionJobs.size).toBe(0);
      expect(hw.connectedPlatforms).toBeInstanceOf(Set);
      expect(hw.connectedPlatforms.size).toBe(0);
    });
  });

  describe('registerDevice', () => {
    const baseDevice = { type: 'speaker', name: 'Office Speaker', capabilities: ['audio'], metadata: { location: 'room1' } };

    it('registers a device with all fields', () => {
      const device = { id: 'dev_1', ...baseDevice };
      const entry = hw.registerDevice(device);
      expect(entry.id).toBe('dev_1');
      expect(entry.type).toBe('speaker');
      expect(entry.name).toBe('Office Speaker');
      expect(entry.status).toBe('online');
      expect(entry.capabilities).toEqual(['audio']);
      expect(entry.metadata).toEqual({ location: 'room1' });
      expect(entry.lastSeen).toBeGreaterThan(0);
      expect(hw.devices.size).toBe(1);
    });

    it('auto-generates id when not provided', () => {
      const entry = hw.registerDevice(baseDevice);
      expect(entry.id).toMatch(/^device_\d+$/);
    });

    it('defaults capabilities to empty array', () => {
      const entry = hw.registerDevice({ type: 'sensor', name: 'Temp' });
      expect(entry.capabilities).toEqual([]);
    });

    it('defaults metadata to empty object', () => {
      const entry = hw.registerDevice({ type: 'sensor', name: 'Temp' });
      expect(entry.metadata).toEqual({});
    });
  });

  describe('unregisterDevice', () => {
    it('removes an existing device and returns true', () => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1' });
      expect(hw.devices.has('dev_1')).toBe(true);
      const result = hw.unregisterDevice('dev_1');
      expect(result).toBe(true);
      expect(hw.devices.has('dev_1')).toBe(false);
    });

    it('returns false for non-existent device', () => {
      expect(hw.unregisterDevice('ghost')).toBe(false);
    });
  });

  describe('getDevices', () => {
    beforeEach(() => {
      hw.registerDevice({ id: 'd1', type: 'speaker', name: 'S1' });
      hw.registerDevice({ id: 'd2', type: 'display', name: 'D1' });
      hw.registerDevice({ id: 'd3', type: 'speaker', name: 'S2' });
    });

    it('returns all devices when no type filter', () => {
      const devices = hw.getDevices();
      expect(devices).toHaveLength(3);
    });

    it('filters by type and online status', () => {
      const speakers = hw.getDevices('speaker');
      expect(speakers).toHaveLength(2);
      expect(speakers.every(d => d.type === 'speaker' && d.status === 'online')).toBe(true);
    });

    it('excludes offline devices from filtered results', () => {
      hw.devices.get('d1').status = 'offline';
      const speakers = hw.getDevices('speaker');
      expect(speakers).toHaveLength(1);
      expect(speakers[0].id).toBe('d3');
    });
  });

  describe('createMeeting', () => {
    it('creates a meeting with all fields', () => {
      const meeting = hw.createMeeting({
        title: 'Sprint Review',
        participants: ['alice', 'bob'],
        deviceId: 'dev_1'
      });
      expect(meeting.id).toMatch(/^meeting_\d+$/);
      expect(meeting.title).toBe('Sprint Review');
      expect(meeting.participants).toEqual(['alice', 'bob']);
      expect(meeting.deviceId).toBe('dev_1');
      expect(meeting.status).toBe('scheduled');
      expect(meeting.startTime).toBeGreaterThan(0);
      expect(meeting.endTime).toBeNull();
      expect(meeting.transcription).toBeNull();
      expect(meeting.summary).toBeNull();
      expect(meeting.actionItems).toEqual([]);
    });

    it('defaults participants to empty array', () => {
      const meeting = hw.createMeeting({ title: 'Standup' });
      expect(meeting.participants).toEqual([]);
    });

    it('defaults startTime to Date.now()', () => {
      const now = Date.now();
      jest.setSystemTime(now);
      const meeting = hw.createMeeting({ title: 'Standup' });
      expect(meeting.startTime).toBe(now);
    });
  });

  describe('startMeeting', () => {
    it('starts a meeting and sets deviceId', () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      const result = hw.startMeeting(meeting.id, 'dev_1');
      expect(result.status).toBe('active');
      expect(result.deviceId).toBe('dev_1');
    });

    it('returns error for non-existent meeting', () => {
      expect(hw.startMeeting('ghost', 'dev_1')).toEqual({ error: 'Meeting not found' });
    });
  });

  describe('endMeeting', () => {
    it('completes a meeting', () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      jest.advanceTimersByTime(1000);
      const result = hw.endMeeting(meeting.id);
      expect(result.status).toBe('completed');
      expect(result.endTime).toBeGreaterThan(0);
    });

    it('returns error for non-existent meeting', () => {
      expect(hw.endMeeting('ghost')).toEqual({ error: 'Meeting not found' });
    });

    it('completes running transcription on end', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      hw.endMeeting(meeting.id);
      const job = hw.getTranscription(meeting.id);
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
    });
  });

  describe('startTranscription', () => {
    it('starts transcription and returns job info', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      const result = await hw.startTranscription(meeting.id);
      expect(result.status).toBe('started');
      expect(result.jobId).toMatch(/^trans_\d+$/);
    });

    it('returns error for non-existent meeting', async () => {
      const result = await hw.startTranscription('ghost');
      expect(result).toEqual({ error: 'Meeting not found' });
    });

    it('populates transcription on the meeting after completion', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = '[speaker_1] hello world\n';
      hw._completeTranscription(meeting.id);
      expect(meeting.transcription).toBe('[speaker_1] hello world\n');
      expect(meeting.summary).toBeTruthy();
      expect(meeting.summary.overview).toBeTruthy();
      expect(meeting.actionItems).toHaveLength(2);
    });
  });

  describe('_simulateTranscription', () => {
    it('returns early when job does not exist', async () => {
      const meeting = hw.createMeeting({ title: 'Test' });
      hw.startMeeting(meeting.id, 'dev_1');
      const result = await hw._simulateTranscription(meeting.id);
      expect(result).toBeUndefined();
    });
  });

  describe('_completeTranscription', () => {
    it('returns early when job does not exist', () => {
      const meeting = hw.createMeeting({ title: 'Test' });
      hw._completeTranscription(meeting.id);
      expect(meeting.transcription).toBeNull();
    });

    it('completes job but skips meeting update when meeting is removed', async () => {
      const meeting = hw.createMeeting({ title: 'Test' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      hw.meetings.delete(meeting.id);
      hw._completeTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
    });
  });

  describe('getTranscription', () => {
    it('returns transcription job for existing meeting', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.getTranscription(meeting.id);
      expect(job.status).toBe('running');
      expect(job.meetingId).toBe(meeting.id);
    });

    it('returns undefined for meeting without transcription', () => {
      expect(hw.getTranscription('ghost')).toBeUndefined();
    });
  });

  describe('sendToDisplay', () => {
    beforeEach(() => {
      hw.registerDevice({ id: 'display_1', type: 'smart_display', name: 'Board' });
      hw.registerDevice({ id: 'speaker_1', type: 'speaker', name: 'Speaker' });
    });

    it('sends content to a smart display', async () => {
      const result = await hw.sendToDisplay('display_1', { title: 'Hello', body: 'World', type: 'text' });
      expect(result.success).toBe(true);
      expect(result.deviceId).toBe('display_1');
      expect(result.displayedAt).toBeGreaterThan(0);
    });

    it('returns error when device is not found', async () => {
      const result = await hw.sendToDisplay('ghost', { title: 'Hi' });
      expect(result).toEqual({ error: 'Device not found or not a display' });
    });

    it('returns error when device is not a display', async () => {
      const result = await hw.sendToDisplay('speaker_1', { title: 'Hi' });
      expect(result).toEqual({ error: 'Device not found or not a display' });
    });

    it('returns error when content is not an object', async () => {
      const result = await hw.sendToDisplay('display_1', 'string');
      expect(result).toEqual({ error: 'Content must be an object' });
    });

    it('returns error when content is null', async () => {
      const result = await hw.sendToDisplay('display_1', null);
      expect(result).toEqual({ error: 'Content must be an object' });
    });

    it('sanitizes HTML chars in content', async () => {
      const result = await hw.sendToDisplay('display_1', { title: '<script>alert("xss")</script>', body: 'safe', type: 'text' });
      expect(result.success).toBe(true);
    });

    it('defaults unknown content type to text', async () => {
      const result = await hw.sendToDisplay('display_1', { title: 'Test', body: 'Body', type: 'unknown' });
      expect(result.success).toBe(true);
    });
  });

  describe('_sanitizeString', () => {
    it('removes HTML special chars', () => {
      expect(hw._sanitizeString('<script>alert("xss")</script>', 1000)).toBe('scriptalert(xss)/script');
    });

    it('truncates to maxLength', () => {
      expect(hw._sanitizeString('hello world', 5)).toBe('hello');
    });

    it('returns empty string for non-string input', () => {
      expect(hw._sanitizeString(null, 100)).toBe('');
      expect(hw._sanitizeString(undefined, 100)).toBe('');
      expect(hw._sanitizeString(42, 100)).toBe('');
    });
  });

  describe('generateMeetingMinutes', () => {
    beforeEach(async () => {
      const meeting = hw.createMeeting({ title: 'Review', participants: ['alice', 'bob'] });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      jest.runAllTimers();
      await Promise.resolve();
    });

    it('returns error when meeting not found', async () => {
      const result = await hw.generateMeetingMinutes('ghost');
      expect(result).toEqual({ error: 'Meeting not found' });
    });

    it('returns error when transcription not available', async () => {
      const meeting = hw.createMeeting({ title: 'Empty' });
      const result = await hw.generateMeetingMinutes(meeting.id);
      expect(result).toEqual({ error: 'Meeting transcription not available' });
    });

    it('formats as markdown by default', async () => {
      const meeting = hw.createMeeting({ title: 'Review', participants: ['alice'] });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = '[speaker_1] hello\n';
      hw._completeTranscription(meeting.id);
      const result = await hw.generateMeetingMinutes(meeting.id);
      expect(typeof result).toBe('string');
      expect(result).toContain('# Review');
      expect(result).toContain('alice');
      expect(result).toContain('## 行动项');
    });

    it('formats as pdf', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = 'test';
      hw._completeTranscription(meeting.id);
      const result = await hw.generateMeetingMinutes(meeting.id, 'pdf');
      expect(result.format).toBe('pdf');
      expect(result.content).toBeTruthy();
    });

    it('formats as docx', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = 'test';
      hw._completeTranscription(meeting.id);
      const result = await hw.generateMeetingMinutes(meeting.id, 'docx');
      expect(result.format).toBe('docx');
      expect(result.content).toBeTruthy();
    });

    it('returns raw minutes for unknown format', async () => {
      const meeting = hw.createMeeting({ title: 'Review' });
      hw.startMeeting(meeting.id, 'dev_1');
      await hw.startTranscription(meeting.id);
      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = 'test';
      hw._completeTranscription(meeting.id);
      const result = await hw.generateMeetingMinutes(meeting.id, 'unknown');
      expect(result.title).toBe('Review');
      expect(result.summary).toBeTruthy();
      expect(result.actionItems).toBeTruthy();
    });
  });

  describe('renderChart', () => {
    beforeEach(() => {
      hw.registerDevice({ id: 'display_1', type: 'smart_display', name: 'Board' });
    });

    it('renders chart on existing device', async () => {
      const result = await hw.renderChart('display_1', { type: 'bar', title: 'Sales', data: [1, 2, 3] });
      expect(result.success).toBe(true);
      expect(result.chartId).toMatch(/^chart_\d+$/);
      expect(result.deviceId).toBe('display_1');
    });

    it('returns error when device not found', async () => {
      const result = await hw.renderChart('ghost', {});
      expect(result).toEqual({ error: 'Device not found' });
    });

    it('defaults chart type to bar', async () => {
      const result = await hw.renderChart('display_1', { title: 'Test', data: [] });
      expect(result.success).toBe(true);
    });
  });

  describe('syncCalendar', () => {
    it('creates meeting from calendar events', async () => {
      const events = [{
        summary: 'Team Standup',
        start: { dateTime: '2026-07-01T09:00:00Z' },
        attendees: [{ email: 'alice@co.com' }, { email: 'bob@co.com' }]
      }];
      const meeting = await hw.syncCalendar('cal_1', events);
      expect(meeting.title).toBe('Team Standup');
      expect(meeting.participants).toEqual(['alice@co.com', 'bob@co.com']);
      expect(meeting.id).toMatch(/^meeting_\d+$/);
    });

    it('handles empty events array', async () => {
      const meeting = await hw.syncCalendar('cal_1', []);
      expect(meeting.title).toBe('会议');
      expect(meeting.participants).toEqual([]);
    });
  });

  describe('registerWebhook', () => {
    beforeEach(() => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1' });
    });

    it('registers a valid HTTPS webhook', () => {
      const result = hw.registerWebhook('dev_1', 'https://hooks.example.com/callback');
      expect(result.success).toBe(true);
      expect(result.webhookId).toMatch(/^webhook_\d+$/);
    });

    it('returns error when device not found', () => {
      const result = hw.registerWebhook('ghost', 'https://hooks.example.com/callback');
      expect(result).toEqual({ error: 'Device not found' });
    });

    it('rejects non-HTTPS URLs', () => {
      const result = hw.registerWebhook('dev_1', 'http://hooks.example.com/callback');
      expect(result).toEqual({ error: 'Invalid webhook URL. Only HTTPS URLs are allowed.' });
    });

    it('rejects URLs without a dot in hostname', () => {
      const result = hw.registerWebhook('dev_1', 'https://localhost/callback');
      expect(result).toEqual({ error: 'Invalid webhook URL. Only HTTPS URLs are allowed.' });
    });

    it('rejects localhost URLs', () => {
      const result = hw.registerWebhook('dev_1', 'https://localhost:3000/callback');
      expect(result.error).toContain('Invalid webhook URL');
    });

    it('rejects 127.0.0.1 URLs', () => {
      const result = hw.registerWebhook('dev_1', 'https://127.0.0.1:3000/callback');
      expect(result.error).toContain('Localhost');
    });

    it('rejects private IP ranges like 192.168.x.x', () => {
      const result = hw.registerWebhook('dev_1', 'https://192.168.1.1/callback');
      expect(result.error).toContain('Private IP');
    });

    it('rejects private IP ranges like 10.x.x.x', () => {
      const result = hw.registerWebhook('dev_1', 'https://10.0.0.1/callback');
      expect(result.error).toContain('Private IP');
    });

    it('reuses existing webhooks array on second registration', () => {
      hw.registerWebhook('dev_1', 'https://hooks.example.com/first');
      const result = hw.registerWebhook('dev_1', 'https://hooks.example.com/second');
      expect(result.success).toBe(true);
      const device = hw.devices.get('dev_1');
      expect(device.webhooks).toHaveLength(2);
    });
  });

  describe('_isValidUrl', () => {
    it('returns true for valid HTTPS URL with dot', () => {
      expect(hw._isValidUrl('https://api.example.com/webhook')).toBe(true);
    });

    it('returns false for HTTP URL', () => {
      expect(hw._isValidUrl('http://api.example.com/webhook')).toBe(false);
    });

    it('returns false for URL without dot', () => {
      expect(hw._isValidUrl('https://localhost/webhook')).toBe(false);
    });

    it('returns false for invalid URL string', () => {
      expect(hw._isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('emitDeviceEvent', () => {
    beforeEach(() => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1' });
      hw.registerWebhook('dev_1', 'https://hooks.example.com/callback');
    });

    it('emits event to registered webhooks', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      hw.emitDeviceEvent('dev_1', { type: 'status_change', data: 'online' });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Emitting event to'),
        expect.objectContaining({ type: 'status_change' })
      );
      consoleSpy.mockRestore();
    });

    it('does nothing when device has no webhooks', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      hw.emitDeviceEvent('dev_1', {});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('does nothing when device not found', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      hw.emitDeviceEvent('ghost', {});
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getDeviceStatus', () => {
    it('returns device status for online device', () => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1', metadata: { battery: 80, storage: 50 } });
      const status = hw.getDeviceStatus('dev_1');
      expect(status.id).toBe('dev_1');
      expect(status.name).toBe('S1');
      expect(status.status).toBe('online');
      expect(status.lastSeen).toBeGreaterThan(0);
      expect(status.battery).toBe(80);
      expect(status.storage).toBe(50);
    });

    it('returns null for non-existent device', () => {
      expect(hw.getDeviceStatus('ghost')).toBeNull();
    });

    it('returns uptime null for offline device', () => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1' });
      hw.devices.get('dev_1').status = 'offline';
      const status = hw.getDeviceStatus('dev_1');
      expect(status.status).toBe('offline');
      expect(status.uptime).toBeNull();
    });

    it('returns undefined battery and storage when metadata lacks them', () => {
      hw.registerDevice({ id: 'dev_1', type: 'speaker', name: 'S1' });
      const status = hw.getDeviceStatus('dev_1');
      expect(status.battery).toBeUndefined();
      expect(status.storage).toBeUndefined();
    });
  });

  describe('connectPlatform', () => {
    it('connects to zoom', () => {
      const result = hw.connectPlatform('zoom');
      expect(result.success).toBe(true);
      expect(result.platform.apiVersion).toBe('v2');
      expect(hw.connectedPlatforms.has('zoom')).toBe(true);
    });

    it('connects to teams', () => {
      const result = hw.connectPlatform('teams');
      expect(result.success).toBe(true);
      expect(hw.connectedPlatforms.has('teams')).toBe(true);
    });

    it('connects to dingtalk', () => {
      const result = hw.connectPlatform('dingtalk');
      expect(result.success).toBe(true);
      expect(hw.connectedPlatforms.has('dingtalk')).toBe(true);
    });

    it('connects to welink', () => {
      const result = hw.connectPlatform('welink');
      expect(result.success).toBe(true);
      expect(hw.connectedPlatforms.has('welink')).toBe(true);
    });

    it('rejects unsupported platform', () => {
      const result = hw.connectPlatform('slack');
      expect(result).toEqual({ error: 'Platform not supported' });
      expect(hw.connectedPlatforms.has('slack')).toBe(false);
    });
  });

  describe('full integration: meeting lifecycle', () => {
    it('handles complete meeting lifecycle with transcription', async () => {
      hw.registerDevice({ id: 'display_1', type: 'smart_display', name: 'Board Room' });

      const meeting = hw.createMeeting({
        title: 'Sprint Planning',
        participants: ['alice', 'bob', 'charlie'],
        deviceId: 'display_1'
      });
      expect(meeting.status).toBe('scheduled');

      hw.startMeeting(meeting.id, 'display_1');
      expect(meeting.status).toBe('active');

      const transResult = await hw.startTranscription(meeting.id);
      expect(transResult.status).toBe('started');

      const job = hw.transcriptionJobs.get(meeting.id);
      job.transcript = '[speaker_1] sprint planning discussion\n';
      hw._completeTranscription(meeting.id);

      const finalMeeting = hw.endMeeting(meeting.id);
      expect(finalMeeting.status).toBe('completed');
      expect(meeting.transcription).toContain('sprint planning');

      const minutes = await hw.generateMeetingMinutes(meeting.id);
      expect(minutes).toContain('Sprint Planning');
      expect(minutes).toContain('alice');
    });
  });
});
