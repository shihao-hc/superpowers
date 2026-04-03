/**
 * OpenAPI/Swagger Documentation Generator
 * 自动生成API文档
 */

const fs = require('fs');
const path = require('path');

class OpenAPIGenerator {
  constructor() {
    this.spec = {
      openapi: '3.0.3',
      info: {
        title: 'UltraWork AI Platform API',
        description: 'Multi-agent AI skill platform with vertical domain markets',
        version: '2.0.0',
        contact: {
          name: 'UltraWork Team',
          email: 'api@ultrawork.ai'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        { url: 'https://api.ultrawork.ai', description: 'Production' },
        { url: 'https://staging-api.ultrawork.ai', description: 'Staging' },
        { url: 'http://localhost:3000', description: 'Development' }
      ],
      tags: [],
      paths: {},
      components: {
        securitySchemes: {},
        schemas: {},
        responses: {},
        parameters: {}
      }
    };

    this.paths = [];
  }

  // 添加服务器信息
  setServer(url, description) {
    this.spec.servers.push({ url, description });
  }

  // 添加标签
  addTag(name, description) {
    this.spec.tags.push({ name, description });
  }

  // 添加认证方案
  addSecurityScheme(name, config) {
    this.spec.components.securitySchemes[name] = config;
  }

  // 添加Schema
  addSchema(name, schema) {
    this.spec.components.schemas[name] = schema;
  }

  // 添加路径
  addPath(method, path, config) {
    const { operationId, summary, description, tags, parameters, requestBody, responses, security, deprecated } = config;

    if (!this.spec.paths[path]) {
      this.spec.paths[path] = {};
    }

    this.spec.paths[path][method] = {
      operationId,
      summary,
      description,
      tags: tags || [],
      parameters: parameters || [],
      requestBody,
      responses: responses || { '200': { description: 'Success' } },
      deprecated: deprecated || false
    };

    if (security) {
      this.spec.paths[path][method].security = security;
    }

    this.paths.push({ method, path, operationId });
  }

  // 添加GET请求
  get(path, config) {
    this.addPath('get', path, config);
  }

  // 添加POST请求
  post(path, config) {
    this.addPath('post', path, config);
  }

  // 添加PUT请求
  put(path, config) {
    this.addPath('put', path, config);
  }

  // 添加DELETE请求
  delete(path, config) {
    this.addPath('delete', path, config);
  }

  // 添加PATCH请求
  patch(path, config) {
    this.addPath('patch', path, config);
  }

  // 生成Schema定义
  generateSchemas() {
    // Skill Schema
    this.addSchema('Skill', {
      type: 'object',
      required: ['id', 'name', 'version'],
      properties: {
        id: { type: 'string', example: 'skill_abc123' },
        name: { type: 'string', example: 'Stock Analyzer' },
        description: { type: 'string', example: 'Analyze stock trends and predict prices' },
        version: { type: 'string', example: '1.2.0', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        category: { type: 'string', enum: ['finance', 'healthcare', 'legal', 'manufacturing', 'education', 'retail'] },
        inputs: {
          type: 'array',
          items: { $ref: '#/components/schemas/SkillInput' }
        },
        outputs: {
          type: 'array',
          items: { $ref: '#/components/schemas/SkillOutput' }
        },
        author: { $ref: '#/components/schemas/Author' },
        stats: { $ref: '#/components/schemas/SkillStats' },
        compliance: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    });

    this.addSchema('SkillInput', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object', 'file'] },
        required: { type: 'boolean' },
        description: { type: 'string' },
        default: { type: 'string' },
        enum: { type: 'array', items: { type: 'string' } }
      }
    });

    this.addSchema('SkillOutput', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        description: { type: 'string' }
      }
    });

    this.addSchema('Author', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        avatar: { type: 'string', format: 'uri' },
        verified: { type: 'boolean' }
      }
    });

    this.addSchema('SkillStats', {
      type: 'object',
      properties: {
        downloads: { type: 'integer' },
        rating: { type: 'number', format: 'float' },
        ratingCount: { type: 'integer' },
        weeklyInstalls: { type: 'integer' }
      }
    });

    // Workflow Schema
    this.addSchema('Workflow', {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        nodes: { type: 'array', items: { $ref: '#/components/schemas/WorkflowNode' } },
        edges: { type: 'array', items: { $ref: '#/components/schemas/WorkflowEdge' } },
        status: { type: 'string', enum: ['draft', 'active', 'paused', 'archived'] },
        createdAt: { type: 'string', format: 'date-time' }
      }
    });

    this.addSchema('WorkflowNode', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string', example: 'skill.execute' },
        name: { type: 'string' },
        position: { $ref: '#/components/schemas/Position' },
        config: { type: 'object' }
      }
    });

    this.addSchema('WorkflowEdge', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        source: { type: 'string' },
        target: { type: 'string' },
        sourcePort: { type: 'string' },
        targetPort: { type: 'string' }
      }
    });

    this.addSchema('Position', {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' }
      }
    });

    // Model Schema
    this.addSchema('Model', {
      type: 'object',
      required: ['id', 'provider', 'name'],
      properties: {
        id: { type: 'string', example: 'openai-gpt-4' },
        provider: { type: 'string', enum: ['openai', 'anthropic', 'local', 'custom'] },
        name: { type: 'string', example: 'GPT-4' },
        type: { type: 'string', enum: ['chat', 'embedding', 'image'] },
        contextWindow: { type: 'integer', example: 128000 },
        inputCost: { type: 'number', example: 0.03 },
        outputCost: { type: 'number', example: 0.06 },
        capabilities: { type: 'array', items: { type: 'string' } }
      }
    });

    // Intent Understanding Schema
    this.addSchema('IntentRequest', {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string', example: '分析本周销售数据并生成报告' },
        context: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            history: { type: 'array' },
            attachments: { type: 'array' }
          }
        }
      }
    });

    this.addSchema('IntentResponse', {
      type: 'object',
      properties: {
        intent: { type: 'string', example: 'report' },
        confidence: { type: 'number', example: 0.92 },
        slots: { type: 'object', additionalProperties: { type: 'string' } },
        skills: { type: 'array', items: { type: 'string' } },
        parameters: { type: 'object' },
        chain: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            steps: { type: 'array', items: { type: 'string' } },
            estimatedTime: { type: 'integer' }
          }
        },
        suggestion: { type: 'string' }
      }
    });

    // Cost Schema
    this.addSchema('CostReport', {
      type: 'object',
      properties: {
        period: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' }
          }
        },
        totalCost: { type: 'number', example: 15420.50 },
        currency: { type: 'string', example: 'USD' },
        breakdown: {
          type: 'object',
          additionalProperties: { type: 'number' }
        },
        byDay: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              cost: { type: 'number' }
            }
          }
        }
      }
    });

    // User Schema
    this.addSchema('User', {
      type: 'object',
      required: ['id', 'email'],
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string' },
        role: { type: 'string', enum: ['owner', 'admin', 'editor', 'viewer', 'approver'] },
        workspace: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' }
      }
    });

    // Workspace Schema
    this.addSchema('Workspace', {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        plan: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
        settings: { type: 'object' },
        owner: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' }
      }
    });

    // Compliance Schema
    this.addSchema('ComplianceReport', {
      type: 'object',
      properties: {
        framework: { type: 'string', example: 'GDPR' },
        scope: { type: 'string' },
        status: { type: 'string', enum: ['compliant', 'non_compliant', 'in_progress'] },
        controls: {
          type: 'array',
          items: { $ref: '#/components/schemas/ComplianceControl' }
        },
        summary: {
          type: 'object',
          properties: {
            totalControls: { type: 'integer' },
            compliant: { type: 'integer' },
            nonCompliant: { type: 'integer' },
            complianceRate: { type: 'number' }
          }
        }
      }
    });

    this.addSchema('ComplianceControl', {
      type: 'object',
      properties: {
        controlId: { type: 'string' },
        controlName: { type: 'string' },
        category: { type: 'string' },
        status: { type: 'string', enum: ['compliant', 'non_compliant'] },
        findings: { type: 'array' }
      }
    });

    // Error Schema
    this.addSchema('Error', {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string', example: 'Invalid input parameters' },
        details: { type: 'array', items: { type: 'object' } }
      }
    });

    // Pagination Schema
    this.addSchema('Pagination', {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        hasMore: { type: 'boolean' }
      }
    });
  }

  // 添加通用响应
  addStandardResponses(operationId) {
    return {
      '400': { description: 'Bad Request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      '403': { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      '404': { description: 'Not Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      '500': { description: 'Internal Server Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
    };
  }

  // 生成完整文档
  generate() {
    this.generateSchemas();
    return this.spec;
  }

  // 保存为JSON文件
  saveToFile(filePath) {
    const spec = this.generate();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));
    return filePath;
  }

  // 生成Markdown文档
  toMarkdown() {
    let md = `# ${this.spec.info.title}\n\n`;
    md += `${this.spec.info.description}\n\n`;
    md += `**Version:** ${this.spec.info.version}\n\n`;
    md += `---\n\n`;

    // 基础URL
    md += `## Base URL\n\n`;
    for (const server of this.spec.servers) {
      md += `- **${server.description}**: \`${server.url}\`\n`;
    }
    md += `\n`;

    // 认证
    md += `## Authentication\n\n`;
    if (Object.keys(this.spec.components.securitySchemes).length > 0) {
      md += `All API endpoints require authentication using Bearer token:\n\n`;
      md += `\`\`\`\nAuthorization: Bearer <your-token>\n\`\`\`\n\n`;
    }

    // 标签
    if (this.spec.tags.length > 0) {
      md += `## API Categories\n\n`;
      for (const tag of this.spec.tags) {
        md += `### ${tag.name}\n${tag.description}\n\n`;
      }
    }

    // 路径
    md += `## Endpoints\n\n`;
    for (const [path, methods] of Object.entries(this.spec.paths)) {
      for (const [method, details] of Object.entries(methods)) {
        md += `### ${method.toUpperCase()} ${path}\n\n`;
        md += `**${details.summary}**\n\n`;
        if (details.description) {
          md += `${details.description}\n\n`;
        }

        if (details.parameters && details.parameters.length > 0) {
          md += `**Parameters:**\n\n`;
          md += `| Name | Type | Required | Description |\n`;
          md += `|------|------|----------|-------------|\n`;
          for (const param of details.parameters) {
            md += `| ${param.name} | ${param.schema?.type || 'string'} | ${param.required ? 'Yes' : 'No'} | ${param.description || '-'} |\n`;
          }
          md += `\n`;
        }

        if (details.requestBody) {
          md += `**Request Body:**\n\n`;
          md += `\`\`\`json\n${JSON.stringify(details.requestBody, null, 2)}\n\`\`\`\n\n`;
        }

        md += `**Responses:**\n\n`;
        for (const [code, response] of Object.entries(details.responses)) {
          md += `- \`${code}\`: ${response.description}\n`;
        }
        md += `\n---\n\n`;
      }
    }

    // Schema
    md += `## Data Models\n\n`;
    for (const [name, schema] of Object.entries(this.spec.components.schemas)) {
      md += `### ${name}\n\n`;
      if (schema.description) {
        md += `${schema.description}\n\n`;
      }
      if (schema.properties) {
        md += `| Property | Type | Required | Description |\n`;
        md += `|---------|------|---------|-------------|\n`;
        for (const [prop, def] of Object.entries(schema.properties)) {
          const type = def.$ref ? def.$ref.split('/').pop() : def.type;
          const required = schema.required?.includes(prop) ? 'Yes' : 'No';
          md += `| ${prop} | ${type} | ${required} | ${def.description || '-'} |\n`;
        }
        md += `\n`;
      }
    }

    return md;
  }
}

// 预定义API路径
function defineSkillAPIs(generator) {
  generator.addTag('Skills', '技能相关API');
  generator.addSecurityScheme('BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  });

  // 技能列表
  generator.get('/api/v1/skills', {
    operationId: 'listSkills',
    summary: 'List all skills',
    description: 'Get a paginated list of all available skills',
    tags: ['Skills'],
    parameters: [
      { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category' },
      { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search skills' },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Results per page' },
      { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Pagination offset' },
      { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['popular', 'new', 'rating'] }, description: 'Sort by' }
    ],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { skills: { type: 'array', items: { $ref: '#/components/schemas/Skill' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
      ...generator.addStandardResponses('listSkills')
    },
    security: [{ BearerAuth: [] }]
  });

  // 获取技能详情
  generator.get('/api/v1/skills/{skillId}', {
    operationId: 'getSkill',
    summary: 'Get skill details',
    tags: ['Skills'],
    parameters: [
      { name: 'skillId', in: 'path', required: true, schema: { type: 'string' }, description: 'Skill ID' }
    ],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } },
      ...generator.addStandardResponses('getSkill')
    }
  });

  // 执行技能
  generator.post('/api/v1/skills/{skillId}/execute', {
    operationId: 'executeSkill',
    summary: 'Execute a skill',
    tags: ['Skills'],
    parameters: [
      { name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true }
        }
      }
    },
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } },
      ...generator.addStandardResponses('executeSkill')
    }
  });

  // 发布技能
  generator.post('/api/v1/skills', {
    operationId: 'createSkill',
    summary: 'Publish a new skill',
    tags: ['Skills'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Skill' }
        }
      }
    },
    responses: {
      '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } },
      ...generator.addStandardResponses('createSkill')
    }
  });
}

function defineWorkflowAPIs(generator) {
  generator.addTag('Workflows', '工作流相关API');

  generator.get('/api/v1/workflows', {
    operationId: 'listWorkflows',
    summary: 'List all workflows',
    tags: ['Workflows'],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Workflow' } } } } }
    }
  });

  generator.post('/api/v1/workflows', {
    operationId: 'createWorkflow',
    summary: 'Create a new workflow',
    tags: ['Workflows'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } }
    },
    responses: {
      '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } }
    }
  });

  generator.post('/api/v1/workflows/{workflowId}/execute', {
    operationId: 'executeWorkflow',
    summary: 'Execute a workflow',
    tags: ['Workflows'],
    parameters: [
      { name: 'workflowId', in: 'path', required: true, schema: { type: 'string' } }
    ],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } }
    }
  });
}

function defineIntentAPIs(generator) {
  generator.addTag('Intent', '意图理解API');

  generator.post('/api/v1/intent/understand', {
    operationId: 'understandIntent',
    summary: 'Understand user intent',
    description: 'Analyze user message and extract intent, slots, and recommended skills',
    tags: ['Intent'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/IntentRequest' } } }
    },
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntentResponse' } } } }
    }
  });

  generator.post('/api/v1/intent/multimodal', {
    operationId: 'understandMultimodal',
    summary: 'Understand multimodal content',
    description: 'Analyze images, audio, video, or documents and extract intent',
    tags: ['Intent'],
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'audio', 'video', 'document'] },
              file: { type: 'string', format: 'binary' },
              caption: { type: 'string' }
            }
          }
        }
      }
    },
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/IntentResponse' } } } }
    }
  });
}

function defineCostAPIs(generator) {
  generator.addTag('Costs', '成本管理API');

  generator.get('/api/v1/costs/report', {
    operationId: 'getCostReport',
    summary: 'Get cost report',
    description: 'Get detailed cost breakdown for the tenant',
    tags: ['Costs'],
    parameters: [
      { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } },
      { name: 'granularity', in: 'query', schema: { type: 'string', enum: ['hourly', 'daily', 'weekly'] } }
    ],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/CostReport' } } } }
    }
  });

  generator.get('/api/v1/costs/forecast', {
    operationId: 'getCostForecast',
    summary: 'Get cost forecast',
    description: 'Get projected costs based on current usage',
    tags: ['Costs'],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } }
    }
  });
}

function defineComplianceAPIs(generator) {
  generator.addTag('Compliance', '合规管理API');

  generator.get('/api/v1/compliance/frameworks', {
    operationId: 'listFrameworks',
    summary: 'List compliance frameworks',
    tags: ['Compliance'],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } }
    }
  });

  generator.post('/api/v1/compliance/assess', {
    operationId: 'runAssessment',
    summary: 'Run compliance assessment',
    tags: ['Compliance'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              framework: { type: 'string' },
              scope: { type: 'string' }
            }
          }
        }
      }
    },
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/ComplianceReport' } } } }
    }
  });

  generator.get('/api/v1/compliance/reports/{framework}', {
    operationId: 'getComplianceReport',
    summary: 'Get compliance report',
    tags: ['Compliance'],
    parameters: [
      { name: 'framework', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'pdf'] } }
    ],
    responses: {
      '200': { description: 'Success' }
    }
  });
}

function defineWorkspaceAPIs(generator) {
  generator.addTag('Workspace', '工作空间API');

  generator.get('/api/v1/workspaces', {
    operationId: 'listWorkspaces',
    summary: 'List workspaces',
    tags: ['Workspace'],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Workspace' } } } } }
    }
  });

  generator.post('/api/v1/workspaces', {
    operationId: 'createWorkspace',
    summary: 'Create workspace',
    tags: ['Workspace'],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Workspace' } } }
    },
    responses: {
      '201': { description: 'Created' }
    }
  });

  generator.get('/api/v1/workspaces/{workspaceId}/members', {
    operationId: 'listMembers',
    summary: 'List workspace members',
    tags: ['Workspace'],
    parameters: [
      { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } }
    ],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } }
    }
  });
}

// 生成完整API文档
function generateFullAPIDoc() {
  const generator = new OpenAPIGenerator();

  // 定义所有API
  defineSkillAPIs(generator);
  defineWorkflowAPIs(generator);
  defineIntentAPIs(generator);
  defineCostAPIs(generator);
  defineComplianceAPIs(generator);
  defineWorkspaceAPIs(generator);

  return generator;
}

module.exports = { OpenAPIGenerator, generateFullAPIDoc };
