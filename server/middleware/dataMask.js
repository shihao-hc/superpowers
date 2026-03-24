const dataMaskService = require('../services/dataMaskService');
const config = require('../../config/mask');

function maskResponseBody(req, res, next) {
  if (!config.enabled) {
    return next();
  }

  const originalSend = res.send;
  res.send = function(body) {
    if (body && typeof body === 'object') {
      const maskedBody = dataMaskService.maskUserData(body);
      return originalSend.call(this, maskedBody);
    }
    return originalSend.call(this, body);
  };

  const originalJson = res.json;
  res.json = function(obj) {
    if (obj && typeof obj === 'object') {
      const maskedObj = dataMaskService.maskUserData(obj);
      return originalJson.call(this, maskedObj);
    }
    return originalJson.call(this, obj);
  };

  next();
}

function maskRequestBody(req, res, next) {
  if (!config.enabled) {
    return next();
  }

  if (req.body && typeof req.body === 'object') {
    req.body = dataMaskService.maskUserData(req.body);
  }
  next();
}

module.exports = {
  maskResponseBody,
  maskRequestBody
};
