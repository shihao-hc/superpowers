// Placeholder for game routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ routes: 'game' }));

module.exports = router;
