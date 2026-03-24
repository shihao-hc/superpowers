const dataMaskService = require('../services/dataMaskService');
const config = require('../../config/mask');

function maskResponseBody(req, res, next) {
  if (!config.enabled) {
    return next();
  }

  const originalSend = res.send;
  res.send = function(body) {
    if (body && typeof body === 'object') {
      try {
        const maskedBody = dataMaskService.maskUserData(body);
        return originalSend.call(this, maskedBody);
      } catch (err) {
        return originalSend.call(this, body);
      }
    }
    return originalSend.call(this, body);
  };

  const originalJson = res.json;
  res.json = function(obj) {
    if (obj && typeof obj === 'object') {
      try {
        const maskedObj = dataMaskService.maskUserData(obj);
        return originalJson.call(this, maskedObj);
      } catch (err) {
        return originalJson.call(this, obj);
      }
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
    try {
      req.body = dataMaskService.maskUserData(req.body);
    } catch (err) {
      // Skip masking on error - arrays are handled by dataMaskService logic
    }
  }
  next();
}

module.exports = {
  maskResponseBody,
  maskRequestBody
};
