// Placeholder for workflow routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ routes: 'workflow' }));

module.exports = router;
