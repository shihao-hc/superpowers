const fs = require('fs');
const path = require('path');

const LICENSE_TYPES = {
  PERSONAL: 'personal',
  COMMERCIAL: 'commercial',
  CC0: 'cc0',
  CC_BY: 'cc_by',
  CC_BY_SA: 'cc_by_sa',
  CC_BY_NC: 'cc_by_nc',
  CC_BY_NC_SA: 'cc_by_nc_sa',
  CC_BY_NC_ND: 'cc_by_nc_nd',
  UNKNOWN: 'unknown'
};

const ALLOWED_LICENSES = [
  LICENSE_TYPES.PERSONAL,
  LICENSE_TYPES.COMMERCIAL,
  LICENSE_TYPES.CC0,
  LICENSE_TYPES.CC_BY,
  LICENSE_TYPES.CC_BY_SA
];

const VRM_ALLOWED_PERMISSIONS = [
  'allow',
  'Allow',
];

const LICENSE_KEYWORDS = {
  [LICENSE_TYPES.COMMERCIAL]: ['commercial', '商用', '商業', 'business', 'profit'],
  [LICENSE_TYPES.CC0]: ['cc0', 'public domain', '公共领域'],
  [LICENSE_TYPES.CC_BY]: ['cc by', 'creative commons attribution', 'cc-by'],
  [LICENSE_TYPES.CC_BY_SA]: ['cc by-sa', 'cc-by-sa', 'creative commons attribution-sharealike'],
  [LICENSE_TYPES.CC_BY_NC]: ['cc by-nc', 'cc-by-nc', 'non-commercial', '非商用'],
  [LICENSE_TYPES.CC_BY_NC_SA]: ['cc by-nc-sa', 'cc-by-nc-sa'],
  [LICENSE_TYPES.CC_BY_NC_ND]: ['cc by-nc-nd', 'cc-by-nc-nd', 'no derivatives']
};

function parseVRMMeta(vrmBuffer) {
  try {
    const text = vrmBuffer.toString('utf8', 0, Math.min(vrmBuffer.length, 100000));
    
    const metaMatch = text.match(/"meta"\s*:\s*\{([^}]+)\}/);
    if (!metaMatch) return null;
    
    const metaText = metaMatch[0];
    const meta = {};
    
    const titleMatch = metaText.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) meta.title = titleMatch[1];
    
    const authorMatch = metaText.match(/"author"\s*:\s*"([^"]+)"/);
    if (authorMatch) meta.author = authorMatch[1];
    
    const contactMatch = metaText.match(/"contactInformation"\s*:\s*"([^"]+)"/);
    if (contactMatch) meta.contactInformation = contactMatch[1];
    
    const allowedUserMatch = metaText.match(/"allowedUserName"\s*:\s*"([^"]+)"/);
    if (allowedUserMatch) meta.allowedUserName = allowedUserMatch[1];
    
    const allowCommercialMatch = metaText.match(/"allowCommercial"\s*:\s*"([^"]+)"/);
    if (allowCommercialMatch) meta.allowCommercial = allowCommercialMatch[1];
    
    const licenseMatch = metaText.match(/"license"\s*:\s*"([^"]+)"/);
    if (licenseMatch) meta.license = licenseMatch[1];
    
    const versionMatch = metaText.match(/"version"\s*:\s*"([^"]+)"/);
    if (versionMatch) meta.version = versionMatch[1];
    
    return meta;
  } catch (error) {
    console.error('[LicenseChecker] 解析 VRM 元数据失败:', error.message);
    return null;
  }
}

function detectLicenseType(meta) {
  if (!meta) return LICENSE_TYPES.UNKNOWN;
  
  const textToCheck = [
    meta.license,
    meta.allowedUserName,
    meta.allowCommercial
  ].filter(Boolean).join(' ').toLowerCase();
  
  for (const [type, keywords] of Object.entries(LICENSE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return type;
      }
    }
  }
  
  if (meta.allowCommercial === 'allow') {
    return LICENSE_TYPES.COMMERCIAL;
  }
  
  if (meta.allowedUserName === 'onlyAuthor') {
    return LICENSE_TYPES.PERSONAL;
  }
  
  return LICENSE_TYPES.UNKNOWN;
}

function isCommercialAllowed(licenseType) {
  return ALLOWED_LICENSES.includes(licenseType);
}

function validateModel(modelPath, checkCommercial = true) {
  const result = {
    valid: false,
    path: modelPath,
    meta: null,
    licenseType: LICENSE_TYPES.UNKNOWN,
    commercialAllowed: false,
    warnings: [],
    errors: []
  };

  try {
    if (!fs.existsSync(modelPath)) {
      result.errors.push('模型文件不存在');
      return result;
    }

    const ext = path.extname(modelPath).toLowerCase();
    if (ext !== '.vrm' && ext !== '.glb' && ext !== '.gltf') {
      result.errors.push(`不支持的文件格式: ${ext}`);
      return result;
    }

    if (ext === '.vrm') {
      const buffer = fs.readFileSync(modelPath, { encoding: null, flag: 'r' });
      result.meta = parseVRMMeta(buffer);
    }

    result.licenseType = detectLicenseType(result.meta);
    result.commercialAllowed = isCommercialAllowed(result.licenseType);

    if (checkCommercial && !result.commercialAllowed) {
      result.warnings.push(`模型许可证 (${result.licenseType}) 可能不允许商用`);
    }

    if (result.licenseType === LICENSE_TYPES.UNKNOWN) {
      result.warnings.push('无法识别模型许可证，请手动确认');
    }

    if (result.meta) {
      if (!result.meta.author) {
        result.warnings.push('模型缺少作者信息');
      }
      if (result.meta.allowedUserName === 'onlyAuthor') {
        result.warnings.push('模型仅限作者使用');
      }
    }

    result.valid = result.errors.length === 0;
    return result;

  } catch (error) {
    result.errors.push(`验证失败: ${error.message}`);
    return result;
  }
}

function validateModelFromUrl(url) {
  return {
    valid: true,
    url: url,
    licenseType: LICENSE_TYPES.UNKNOWN,
    commercialAllowed: false,
    warnings: ['远程模型无法自动验证许可证，请手动确认'],
    errors: []
  };
}

function generateLicenseReport(modelDir) {
  const report = {
    timestamp: new Date().toISOString(),
    totalModels: 0,
    validModels: 0,
    commercialModels: 0,
    unknownLicense: 0,
    models: []
  };

  if (!fs.existsSync(modelDir)) {
    return report;
  }

  const files = fs.readdirSync(modelDir);
  for (const file of files) {
    const filePath = path.join(modelDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && path.extname(file).toLowerCase() === '.vrm') {
      report.totalModels++;
      const result = validateModel(filePath);
      report.models.push(result);

      if (result.valid) report.validModels++;
      if (result.commercialAllowed) report.commercialModels++;
      if (result.licenseType === LICENSE_TYPES.UNKNOWN) report.unknownLicense++;
    }
  }

  return report;
}

function checkModelsDirectory(modelDir) {
  const report = generateLicenseReport(modelDir);
  
  console.log('[LicenseChecker] 模型许可证报告:');
  console.log(`  总计: ${report.totalModels} 个模型`);
  console.log(`  有效: ${report.validModels} 个`);
  console.log(`  允许商用: ${report.commercialModels} 个`);
  console.log(`  未知许可: ${report.unknownLicense} 个`);

  for (const model of report.models) {
    if (model.warnings.length > 0) {
      console.warn(`[LicenseChecker] ${path.basename(model.path)}: ${model.warnings.join(', ')}`);
    }
  }

  return report;
}

module.exports = {
  LICENSE_TYPES,
  ALLOWED_LICENSES,
  parseVRMMeta,
  detectLicenseType,
  isCommercialAllowed,
  validateModel,
  validateModelFromUrl,
  generateLicenseReport,
  checkModelsDirectory
};
