const dataMask = require('../utils/dataMask');
const config = require('../../config/mask');

class DataMaskService {
  constructor() {
    this.config = config;
  }

  maskUserData(user) {
    if (!user) return null;
    const maskedUser = { ...user };
    const fields = this.config.fields;
    for (const field of fields) {
      if (field in maskedUser && maskedUser[field]) {
        const maskMethod = this.getMaskMethod(field);
        if (maskMethod && typeof dataMask[maskMethod] === 'function') {
          maskedUser[field] = dataMask[maskMethod](maskedUser[field]);
        }
      }
    }
    return maskedUser;
  }

  getMaskMethod(field) {
    const methodMap = {
      email: 'maskEmail',
      phone: 'maskPhone',
      idCard: 'maskIdCard',
      bankCard: 'maskBankCard',
      ip: 'maskIP',
      deviceFingerprint: 'maskDeviceFingerprint'
    };
    return methodMap[field];
  }

  unmaskField(value, fieldType, authKey) {
    if (!value || !fieldType || !authKey) return value;
    const validFieldTypes = ['email', 'phone', 'idCard', 'bankCard', 'ip', 'deviceFingerprint'];
    if (!validFieldTypes.includes(fieldType)) return value;
    return dataMask.reversibleUnmask(value, fieldType, authKey);
  }

  batchMask(dataArray, fields) {
    if (!Array.isArray(dataArray)) return dataArray;
    return dataArray.map(item => {
      if (typeof item === 'object' && item !== null) {
        return dataMask.maskObject(item, fields);
      }
      return item;
    });
  }

  getMaskedLogEntry(log) {
    if (!log || typeof log !== 'object') return log;
    const maskedLog = { ...log };
    const sensitiveFields = ['email', 'phone', 'ip', 'deviceFingerprint'];
    for (const field of sensitiveFields) {
      if (field in maskedLog && maskedLog[field]) {
        const maskMethod = this.getMaskMethod(field);
        if (maskMethod && typeof dataMask[maskMethod] === 'function') {
          maskedLog[field] = dataMask[maskMethod](maskedLog[field]);
        }
      }
    }
    return maskedLog;
  }
}

module.exports = new DataMaskService();