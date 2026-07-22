const fs = require('fs');
const c = fs.readFileSync('D:/龙虾/src/core/BrainSystem.js', 'utf8');
const lines = c.split('\n');
lines.forEach((l, i) => {
    if (l.toLowerCase().includes('persistence')) {
        console.log(`${i + 1}: ${l.trim()}`);
    }
});
