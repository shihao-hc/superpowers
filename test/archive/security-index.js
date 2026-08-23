/**
 * Security Module - 安全系统
 *
 * 功能:
 * - 认证授权
 * - 输入验证
 * - 加密解密
 * - 速率限制
 * - 零信任安全 (WIP)
 */

const AdvancedRateLimiter = require('./AdvancedRateLimiter.js');
const DependencyScanner = require('./DependencyScanner.js');
const EnhancedAuthService = require('./EnhancedAuthService.js');
const EnhancedEncryption = require('./EnhancedEncryption.js');
const EnhancedInputValidator = require('./EnhancedInputValidator.js');
const OutputEncoder = require('./OutputEncoder.js');
const SecureErrorHandler = require('./SecureErrorHandler.js');
const SecurityHardening = require('./SecurityHardening.js');
const SecurityMiddleware = require('./SecurityMiddleware.js');
const SessionManager = require('./SessionManager.js');

module.exports = {
  AdvancedRateLimiter: AdvancedRateLimiter.AdvancedRateLimiter || AdvancedRateLimiter,
  DependencyScanner: DependencyScanner.DependencyScanner || DependencyScanner,
  EnhancedAuthService: EnhancedAuthService.EnhancedAuthService || EnhancedAuthService,
  EnhancedEncryption: EnhancedEncryption.EnhancedEncryption || EnhancedEncryption,
  EnhancedInputValidator: EnhancedInputValidator.EnhancedInputValidator || EnhancedInputValidator,
  OutputEncoder: OutputEncoder.OutputEncoder || OutputEncoder,
  SecureErrorHandler: SecureErrorHandler.SecureErrorHandler || SecureErrorHandler,
  SecurityHardening: SecurityHardening.SecurityHardening || SecurityHardening,
  SecurityMiddleware: SecurityMiddleware.SecurityMiddleware || SecurityMiddleware,
  SessionManager: SessionManager.SessionManager || SessionManager
};
