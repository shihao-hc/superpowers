// Placeholder for personality routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ routes: 'personality' }));

module.exports = router;
