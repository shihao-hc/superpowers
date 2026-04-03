const crypto = require('crypto');

const secretKey = process.env.MASK_SECRET_KEY;
if (!secretKey) {
  console.warn('[WARN] MASK_SECRET_KEY not set - reversible masking will be disabled');
}

module.exports = {
  enabled: process.env.MASK_ENABLED === 'true',
  secretKey: secretKey || null,
  fields: (process.env.MASK_FIELDS || 'email,phone,idCard,bankCard,ip,deviceFingerprint').split(','),
  reversible: !!secretKey,
  algorithm: 'aes-256-gcm',
  ivLength: 16,
  authTagLength: 16
}
