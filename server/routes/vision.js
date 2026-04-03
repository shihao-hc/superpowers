// Placeholder for vision routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ routes: 'vision' }));

module.exports = router;
