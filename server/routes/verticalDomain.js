// Placeholder for verticalDomain routes
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ routes: 'verticalDomain' }));

module.exports = router;
