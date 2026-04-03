/**
 * Mobile API Server
 * Provides REST API endpoints for React Native mobile app
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Mock user authentication (replace with real auth)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token === 'invalid_token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = { id: 'user_123', tenantId: 'tenant_abc' };
  next();
}

// ========== Auth Endpoints ==========

router.post('/auth/login', async (req, res) => {
  const { email, password, tenantId } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  // In production, validate against enterprise system
  const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
  
  res.json({
    success: true,
    token,
    user: {
      id: 'user_123',
      email,
      name: 'Demo User',
      avatar: null,
      tenantId: tenantId || 'tenant_abc'
    },
    expiresIn: 86400
  });
});

router.post('/auth/sso', async (req, res) => {
  const { provider, code, redirectUri } = req.body;
  
  // Handle SSO callback
  res.json({
    success: true,
    token: 'sso_token_example',
    user: { id: 'user_sso', email: 'user@company.com' }
  });
});

router.post('/auth/logout', authenticateToken, (req, res) => {
  res.json({ success: true });
});

// ========== Chat Endpoints ==========

router.post('/chat/send', authenticateToken, async (req, res) => {
  const { message, conversationId, attachments } = req.body;
  
  if (!message && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: 'Message or attachments required' });
  }
  
  // In production, send to WebSocket or process directly
  res.json({
    success: true,
    conversationId: conversationId || `conv_${Date.now()}`,
    messageId: `msg_${Date.now()}`,
    response: {
      content: '消息已收到，正在处理...',
      skillUsed: null
    }
  });
});

router.get('/chat/conversations', authenticateToken, (req, res) => {
  res.json({
    conversations: [
      {
        id: 'conv_1',
        title: '财务报告生成',
        lastMessage: '报告已生成完成',
        lastMessageAt: Date.now() - 3600000,
        unreadCount: 2
      },
      {
        id: 'conv_2',
        title: '合同审查',
        lastMessage: '发现3个风险条款',
        lastMessageAt: Date.now() - 7200000,
        unreadCount: 0
      }
    ]
  });
});

router.get('/chat/conversations/:id/messages', authenticateToken, (req, res) => {
  res.json({
    messages: [
      {
        id: 'msg_1',
        role: 'user',
        content: '帮我生成季度财务报告',
        createdAt: Date.now() - 7200000
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: '好的，正在为您生成季度财务报告...',
        skillUsed: null,
        createdAt: Date.now() - 7100000
      },
      {
        id: 'msg_3',
        role: 'assistant',
        content: '报告已生成完成！',
        skillUsed: 'financial-report-gen',
        attachments: [{ type: 'pdf', name: 'Q4_Report.pdf', url: '/files/Q4_Report.pdf' }],
        createdAt: Date.now() - 7000000
      }
    ]
  });
});

// ========== Skills Endpoints ==========

router.get('/skills', authenticateToken, async (req, res) => {
  const { category, search } = req.query;
  
  // In production, fetch from skill manager
  res.json({
    skills: [
      { id: 'financial-report-gen', name: '财务报表生成', category: 'finance', icon: '📊' },
      { id: 'contract-review', name: '合同审查', category: 'legal', icon: '⚖️' },
      { id: 'smart-grading', name: '智能作业批改', category: 'education', icon: '✏️' }
    ],
    total: 53
  });
});

router.get('/skills/:id', authenticateToken, (req, res) => {
  res.json({
    id: req.params.id,
    name: '财务报表生成',
    description: '自动生成各类财务报表',
    inputs: [
      { name: 'period', type: 'string', required: true }
    ],
    outputs: [
      { name: 'report', type: 'pdf' }
    ]
  });
});

router.post('/skills/:id/execute', authenticateToken, async (req, res) => {
  const { inputs } = req.body;
  
  res.json({
    success: true,
    executionId: `exec_${Date.now()}`,
    status: 'pending'
  });
});

router.get('/skills/:id/execute/:execId', authenticateToken, (req, res) => {
  res.json({
    executionId: req.params.execId,
    status: 'completed',
    result: { reportUrl: '/files/report.pdf' }
  });
});

// ========== Voice Endpoints ==========

router.post('/voice/transcribe', authenticateToken, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file required' });
  }
  
  // In production, use speech-to-text service
  res.json({
    success: true,
    text: '帮我生成季度财务报告',
    confidence: 0.95,
    language: 'zh-CN'
  });
});

router.post('/voice/synthesize', authenticateToken, async (req, res) => {
  const { text, voice } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text required' });
  }
  
  // In production, use text-to-speech service
  res.json({
    success: true,
    audioUrl: '/audio/response_001.mp3',
    duration: 5.2
  });
});

// ========== File Upload ==========

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File required' });
  }
  
  res.json({
    success: true,
    fileId: `file_${Date.now()}`,
    filename: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    url: `/files/${req.file.originalname}`
  });
});

// ========== Profile Endpoints ==========

router.get('/profile', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: 'user@example.com',
      name: 'Demo User',
      avatar: null,
      role: 'user',
      settings: {
        theme: 'light',
        language: 'zh-CN',
        notifications: true,
        voiceEnabled: true
      }
    }
  });
});

router.put('/profile', authenticateToken, (req, res) => {
  const { name, settings } = req.body;
  
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: name || 'Demo User',
      settings: settings || {}
    }
  });
});

// ========== Notifications ==========

router.get('/notifications', authenticateToken, (req, res) => {
  res.json({
    notifications: [
      {
        id: 'notif_1',
        type: 'skill_complete',
        title: '报告生成完成',
        body: '您的财务报告已生成完成',
        read: false,
        createdAt: Date.now() - 1800000
      }
    ]
  });
});

router.put('/notifications/:id/read', authenticateToken, (req, res) => {
  res.json({ success: true });
});

// ========== Offline Sync ==========

router.get('/sync/status', authenticateToken, (req, res) => {
  res.json({
    lastSync: Date.now() - 300000,
    pendingChanges: 0,
    offlineEnabled: true
  });
});

router.post('/sync/push', authenticateToken, (req, res) => {
  const { changes } = req.body;
  
  res.json({
    success: true,
    syncedCount: changes?.length || 0
  });
});

router.get('/sync/pull', authenticateToken, (req, res) => {
  res.json({
    skills: [],
    conversations: [],
    lastSync: Date.now()
  });
});

module.exports = router;
