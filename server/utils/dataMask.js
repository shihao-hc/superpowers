const crypto = require('crypto');

const SALT = process.env.MASK_SALT || crypto.createHash('sha256').update('default-salt').digest('hex').slice(0, 16);

function maskEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length !== 11) return phone;
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-4)}`;
}

function maskIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return idCard;
  if (idCard.length < 8) return idCard;
  return `${idCard.slice(0, 6)}********${idCard.slice(-4)}`;
}

function maskBankCard(bankCard) {
  if (!bankCard || typeof bankCard !== 'string') return bankCard;
  const cleaned = bankCard.replace(/\s/g, '');
  if (cleaned.length < 8) return bankCard;
  return `${cleaned.slice(0, 6)}****${cleaned.slice(-5)}`;
}

function maskIP(ip) {
  if (!ip || typeof ip !== 'string') return ip;
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.**.**`;
}

function maskDeviceFingerprint(fp) {
  if (!fp || typeof fp !== 'string') return fp;
  if (fp.length < 8) return fp;
  return `${fp.slice(0, 3)}******${fp.slice(3, 7)}`;
}

function maskObject(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = { ...obj };
  const maskingFunctions = {
    email: maskEmail,
    phone: maskPhone,
    idCard: maskIdCard,
    bankCard: maskBankCard,
    ip: maskIP,
    deviceFingerprint: maskDeviceFingerprint
  };
  for (const field of fields) {
    if (field in masked && maskingFunctions[field]) {
      masked[field] = maskingFunctions[field](masked[field]);
    }
  }
  return masked;
}

function reversibleMask(value, fieldType, authKey) {
  if (!value || !authKey) return value;
  const key = crypto.scryptSync(authKey, SALT, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(JSON.stringify({ value, fieldType }), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `rm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function reversibleUnmask(maskedValue, fieldType, authKey) {
  if (!maskedValue || !maskedValue.startsWith('rm:') || !authKey) return maskedValue;
  try {
    const parts = maskedValue.split(':');
    if (parts.length !== 4) return maskedValue;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    const key = crypto.scryptSync(authKey, SALT, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const { value, fieldType: type } = JSON.parse(decrypted);
    return value;
  } catch {
    return maskedValue;
  }
}

module.exports = {
  maskEmail,
  maskPhone,
  maskIdCard,
  maskBankCard,
  maskIP,
  maskDeviceFingerprint,
  maskObject,
  reversibleMask,
  reversibleUnmask
};
