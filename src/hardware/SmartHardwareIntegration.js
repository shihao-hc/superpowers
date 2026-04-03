/**
 * Smart Hardware Integration
 * Meeting Assistant & Smart Device Integration
 */

class SmartHardwareIntegration {
  constructor(options = {}) {
    this.devices = new Map();
    this.meetings = new Map();
    this.transcriptionJobs = new Map();
    
    this.connectedPlatforms = new Set();
  }

  // Device Management
  registerDevice(device) {
    const deviceEntry = {
      id: device.id || `device_${Date.now()}`,
      type: device.type,
      name: device.name,
      status: 'online',
      capabilities: device.capabilities || [],
      lastSeen: Date.now(),
      metadata: device.metadata || {}
    };
    
    this.devices.set(deviceEntry.id, deviceEntry);
    console.log(`[SmartHardware] Device registered: ${deviceEntry.name} (${deviceEntry.type})`);
    
    return deviceEntry;
  }

  unregisterDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    
    device.status = 'offline';
    this.devices.delete(deviceId);
    return true;
  }

  getDevices(type) {
    const devices = Array.from(this.devices.values());
    if (type) {
      return devices.filter(d => d.type === type && d.status === 'online');
    }
    return devices;
  }

  // Meeting Assistant
  createMeeting(data) {
    const meeting = {
      id: `meeting_${Date.now()}`,
      title: data.title,
      participants: data.participants || [],
      deviceId: data.deviceId,
      startTime: data.startTime || Date.now(),
      endTime: null,
      status: 'scheduled',
      transcription: null,
      summary: null,
      actionItems: []
    };
    
    this.meetings.set(meeting.id, meeting);
    return meeting;
  }

  startMeeting(meetingId, deviceId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: 'Meeting not found' };
    
    meeting.status = 'active';
    meeting.startTime = Date.now();
    meeting.deviceId = deviceId;
    
    return meeting;
  }

  endMeeting(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: 'Meeting not found' };
    
    meeting.status = 'completed';
    meeting.endTime = Date.now();
    
    // Trigger transcription completion if running
    const job = this.transcriptionJobs.get(meetingId);
    if (job && job.status === 'running') {
      this._completeTranscription(meetingId);
    }
    
    return meeting;
  }

  // Meeting Transcription
  async startTranscription(meetingId, options = {}) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: 'Meeting not found' };
    
    const job = {
      id: `trans_${Date.now()}`,
      meetingId,
      status: 'running',
      startedAt: Date.now(),
      progress: 0,
      audioChunks: [],
      transcript: ''
    };
    
    this.transcriptionJobs.set(meetingId, job);
    
    // Simulate real-time transcription
    this._simulateTranscription(meetingId);
    
    return { jobId: job.id, status: 'started' };
  }

  async _simulateTranscription(meetingId) {
    const job = this.transcriptionJobs.get(meetingId);
    if (!job) return;
    
    const sampleTranscript = [
      { speaker: 'speaker_1', text: '大家好，今天我们来讨论一下项目进度。', time: 1000 },
      { speaker: 'speaker_2', text: '上周完成了用户界面的设计，本周开始开发。', time: 5000 },
      { speaker: 'speaker_1', text: '很好，后端API的进度如何？', time: 10000 },
      { speaker: 'speaker_3', text: 'API已经完成了80%，预计下周可以完成联调。', time: 15000 },
      { speaker: 'speaker_2', text: '下周我们需要进行一次测试，确保功能完整。', time: 20000 }
    ];
    
    let fullTranscript = '';
    for (const segment of sampleTranscript) {
      await new Promise(resolve => setTimeout(resolve, segment.time - job.progress));
      
      job.progress = segment.time;
      job.transcript += `[${segment.speaker}] ${segment.text}\n`;
      fullTranscript = job.transcript;
    }
    
    this._completeTranscription(meetingId);
  }

  _completeTranscription(meetingId) {
    const job = this.transcriptionJobs.get(meetingId);
    if (!job) return;
    
    job.status = 'completed';
    job.completedAt = Date.now();
    job.progress = 100;
    
    const meeting = this.meetings.get(meetingId);
    if (meeting) {
      meeting.transcription = job.transcript;
      meeting.summary = this._generateSummary(job.transcript);
      meeting.actionItems = this._extractActionItems(job.transcript);
    }
  }

  _generateSummary(transcript) {
    return {
      overview: '本次会议主要讨论了项目进度和下一步计划。',
      keyPoints: [
        '用户界面设计已完成',
        '后端API开发进度80%',
        '下周进行联调测试'
      ],
      decisions: [
        '确认下周完成API联调',
        '安排测试时间'
      ]
    };
  }

  _extractActionItems(transcript) {
    return [
      {
        id: 'action_1',
        text: '完成API联调',
        assignee: '后端团队',
        dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000
      },
      {
        id: 'action_2',
        text: '进行系统测试',
        assignee: '测试团队',
        dueDate: Date.now() + 10 * 24 * 60 * 60 * 1000
      }
    ];
  }

  getTranscription(meetingId) {
    return this.transcriptionJobs.get(meetingId);
  }

  // Smart Display Control
  async sendToDisplay(deviceId, content) {
    const device = this.devices.get(deviceId);
    if (!device || device.type !== 'smart_display') {
      return { error: 'Device not found or not a display' };
    }
    
    if (typeof content !== 'object' || content === null) {
      return { error: 'Content must be an object' };
    }
    
    const sanitizedContent = {
      title: this._sanitizeString(content.title, 200),
      body: this._sanitizeString(content.body, 5000),
      type: ['text', 'image', 'video', 'chart'].includes(content.type) ? content.type : 'text'
    };
    
    console.log(`[SmartHardware] Sending content to ${device.name}:`, sanitizedContent);
    
    return {
      success: true,
      deviceId,
      displayedAt: Date.now()
    };
  }
  
  _sanitizeString(str, maxLength) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>&"']/g, '').slice(0, maxLength);
  }

  // Meeting Minutes Generation
  async generateMeetingMinutes(meetingId, format = 'markdown') {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: 'Meeting not found' };
    
    if (!meeting.transcription) {
      return { error: 'Meeting transcription not available' };
    }
    
    const minutes = {
      title: meeting.title,
      date: new Date(meeting.startTime).toLocaleString('zh-CN'),
      duration: meeting.endTime - meeting.startTime,
      participants: meeting.participants,
      summary: meeting.summary,
      actionItems: meeting.actionItems,
      transcript: meeting.transcription
    };
    
    switch (format) {
      case 'markdown':
        return this._formatAsMarkdown(minutes);
      case 'pdf':
        return this._formatAsPDF(minutes);
      case 'docx':
        return this._formatAsDocx(minutes);
      default:
        return minutes;
    }
  }

  _formatAsMarkdown(minutes) {
    return `# ${minutes.title}

**日期**: ${minutes.date}
**时长**: ${Math.round(minutes.duration / 60000)}分钟
**参会人**: ${minutes.participants.join(', ')}

## 摘要
${minutes.summary.overview}

## 关键要点
${minutes.summary.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## 决议
${minutes.summary.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

## 行动项
| 任务 | 负责人 | 截止日期 |
|------|--------|----------|
${minutes.actionItems.map(a => `| ${a.text} | ${a.assignee} | ${new Date(a.dueDate).toLocaleDateString('zh-CN')} |`).join('\n')}

## 完整记录
\`\`\`
${minutes.transcript}
\`\`\`
`;
  }

  _formatAsPDF(minutes) {
    return { format: 'pdf', content: minutes };
  }

  _formatAsDocx(minutes) {
    return { format: 'docx', content: minutes };
  }

  // Data Visualization for Smart Boards
  async renderChart(deviceId, chartData) {
    const device = this.devices.get(deviceId);
    if (!device) return { error: 'Device not found' };
    
    // Generate chart image
    const chartConfig = {
      type: chartData.type || 'bar',
      title: chartData.title,
      data: chartData.data,
      options: chartData.options || {}
    };
    
    return {
      success: true,
      chartId: `chart_${Date.now()}`,
      imageUrl: `/charts/${chartConfig.chartId}.png`,
      deviceId
    };
  }

  // Calendar Integration
  async syncCalendar(calendarId, events) {
    const meeting = this.createMeeting({
      title: events[0]?.summary || '会议',
      startTime: events[0]?.start?.dateTime,
      participants: events[0]?.attendees?.map(a => a.email) || []
    });
    
    return meeting;
  }

  // Webhook for Real-time Updates
  registerWebhook(deviceId, callbackUrl) {
    const device = this.devices.get(deviceId);
    if (!device) return { error: 'Device not found' };
    
    if (!this._isValidUrl(callbackUrl)) {
      return { error: 'Invalid webhook URL. Only HTTPS URLs are allowed.' };
    }
    
    const parsedUrl = new URL(callbackUrl);
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsedUrl.hostname)) {
      return { error: 'Localhost URLs are not allowed for webhooks.' };
    }
    
    const privateIpRanges = [
      /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
      /^169\.254\./, /^127\./, /^fc00:/, /^fe80:/, /^::1$/
    ];
    if (privateIpRanges.some(range => range.test(parsedUrl.hostname))) {
      return { error: 'Private IP addresses are not allowed for webhooks.' };
    }
    
    if (!device.webhooks) device.webhooks = [];
    device.webhooks.push({
      id: `webhook_${Date.now()}`,
      url: callbackUrl,
      createdAt: Date.now()
    });
    
    return { success: true, webhookId: device.webhooks[device.webhooks.length - 1].id };
  }
  
  _isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname && parsed.hostname.includes('.');
    } catch {
      return false;
    }
  }

  emitDeviceEvent(deviceId, event) {
    const device = this.devices.get(deviceId);
    if (!device || !device.webhooks) return;
    
    for (const webhook of device.webhooks) {
      console.log(`[SmartHardware] Emitting event to ${webhook.url}:`, event);
    }
  }

  // Device Status Monitoring
  getDeviceStatus(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    
    return {
      id: device.id,
      name: device.name,
      status: device.status,
      lastSeen: device.lastSeen,
      uptime: device.status === 'online' ? Date.now() - device.registeredAt : null,
      battery: device.metadata.battery,
      storage: device.metadata.storage
    };
  }

  // Supported Platforms
  connectPlatform(platform) {
    const platforms = {
      zoom: { apiVersion: 'v2', capabilities: ['meeting', 'transcription'] },
      teams: { apiVersion: 'v1', capabilities: ['meeting', 'transcription'] },
      dingtalk: { apiVersion: 'v2', capabilities: ['meeting', 'calendar'] },
      welink: { apiVersion: 'v1', capabilities: ['meeting'] }
    };
    
    if (platforms[platform]) {
      this.connectedPlatforms.add(platform);
      console.log(`[SmartHardware] Connected to ${platform}`);
      return { success: true, platform: platforms[platform] };
    }
    
    return { error: 'Platform not supported' };
  }
}

module.exports = { SmartHardwareIntegration };
