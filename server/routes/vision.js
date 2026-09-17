// Placeholder for vision routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.status(501).json({ error: 'vision 功能未实现（占位路由）', code: 'NOT_IMPLEMENTED' }));

module.exports = router;
