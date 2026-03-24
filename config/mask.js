module.exports = {
  enabled: process.env.MASK_ENABLED === 'true',
  secretKey: process.env.MASK_SECRET_KEY || 'default-secret-key-change-in-production',
  fields: (process.env.MASK_FIELDS || 'email,phone,idCard,bankCard,ip,deviceFingerprint').split(','),
  reversible: true,
  algorithm: 'aes-256-gcm',
  ivLength: 16,
  authTagLength: 16
}
