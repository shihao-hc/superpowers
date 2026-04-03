# UltraWork AI Platform API

Multi-agent AI skill platform with vertical domain markets

**Version:** 2.0.0

---

## Base URL

- **Production**: `https://api.ultrawork.ai`
- **Staging**: `https://staging-api.ultrawork.ai`
- **Development**: `http://localhost:3000`

## Authentication

All API endpoints require authentication using Bearer token:

```
Authorization: Bearer <your-token>
```

## API Categories

### Skills
技能相关API

### Workflows
工作流相关API

### Intent
意图理解API

### Costs
成本管理API

### Compliance
合规管理API

### Workspace
工作空间API

## Endpoints

### GET /api/v1/skills

**List all skills**

Get a paginated list of all available skills

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| category | string | No | Filter by category |
| search | string | No | Search skills |
| limit | integer | No | Results per page |
| offset | integer | No | Pagination offset |
| sortBy | string | No | Sort by |

**Responses:**

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

### POST /api/v1/skills

**Publish a new skill**

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "$ref": "#/components/schemas/Skill"
      }
    }
  }
}
```

**Responses:**

- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

### GET /api/v1/skills/{skillId}

**Get skill details**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| skillId | string | Yes | Skill ID |

**Responses:**

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

### POST /api/v1/skills/{skillId}/execute

**Execute a skill**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| skillId | string | Yes | - |

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "additionalProperties": true
      }
    }
  }
}
```

**Responses:**

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

### GET /api/v1/workflows

**List all workflows**

**Responses:**

- `200`: Success

---

### POST /api/v1/workflows

**Create a new workflow**

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "$ref": "#/components/schemas/Workflow"
      }
    }
  }
}
```

**Responses:**

- `201`: Created

---

### POST /api/v1/workflows/{workflowId}/execute

**Execute a workflow**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| workflowId | string | Yes | - |

**Responses:**

- `200`: Success

---

### POST /api/v1/intent/understand

**Understand user intent**

Analyze user message and extract intent, slots, and recommended skills

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "$ref": "#/components/schemas/IntentRequest"
      }
    }
  }
}
```

**Responses:**

- `200`: Success

---

### POST /api/v1/intent/multimodal

**Understand multimodal content**

Analyze images, audio, video, or documents and extract intent

**Request Body:**

```json
{
  "required": true,
  "content": {
    "multipart/form-data": {
      "schema": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "image",
              "audio",
              "video",
              "document"
            ]
          },
          "file": {
            "type": "string",
            "format": "binary"
          },
          "caption": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

**Responses:**

- `200`: Success

---

### GET /api/v1/costs/report

**Get cost report**

Get detailed cost breakdown for the tenant

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| period | string | No | - |
| granularity | string | No | - |

**Responses:**

- `200`: Success

---

### GET /api/v1/costs/forecast

**Get cost forecast**

Get projected costs based on current usage

**Responses:**

- `200`: Success

---

### GET /api/v1/compliance/frameworks

**List compliance frameworks**

**Responses:**

- `200`: Success

---

### POST /api/v1/compliance/assess

**Run compliance assessment**

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "type": "object",
        "properties": {
          "framework": {
            "type": "string"
          },
          "scope": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

**Responses:**

- `200`: Success

---

### GET /api/v1/compliance/reports/{framework}

**Get compliance report**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| framework | string | Yes | - |
| format | string | No | - |

**Responses:**

- `200`: Success

---

### GET /api/v1/workspaces

**List workspaces**

**Responses:**

- `200`: Success

---

### POST /api/v1/workspaces

**Create workspace**

**Request Body:**

```json
{
  "required": true,
  "content": {
    "application/json": {
      "schema": {
        "$ref": "#/components/schemas/Workspace"
      }
    }
  }
}
```

**Responses:**

- `201`: Created

---

### GET /api/v1/workspaces/{workspaceId}/members

**List workspace members**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| workspaceId | string | Yes | - |

**Responses:**

- `200`: Success

---

## Data Models

### Skill

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | Yes | - |
| name | string | Yes | - |
| description | string | No | - |
| version | string | Yes | - |
| category | string | No | - |
| inputs | array | No | - |
| outputs | array | No | - |
| author | Author | No | - |
| stats | SkillStats | No | - |
| compliance | array | No | - |
| createdAt | string | No | - |
| updatedAt | string | No | - |

### SkillInput

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| name | string | No | - |
| type | string | No | - |
| required | boolean | No | - |
| description | string | No | - |
| default | string | No | - |
| enum | array | No | - |

### SkillOutput

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| name | string | No | - |
| type | string | No | - |
| description | string | No | - |

### Author

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | No | - |
| name | string | No | - |
| avatar | string | No | - |
| verified | boolean | No | - |

### SkillStats

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| downloads | integer | No | - |
| rating | number | No | - |
| ratingCount | integer | No | - |
| weeklyInstalls | integer | No | - |

### Workflow

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | Yes | - |
| name | string | Yes | - |
| description | string | No | - |
| nodes | array | No | - |
| edges | array | No | - |
| status | string | No | - |
| createdAt | string | No | - |

### WorkflowNode

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | No | - |
| type | string | No | - |
| name | string | No | - |
| position | Position | No | - |
| config | object | No | - |

### WorkflowEdge

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | No | - |
| source | string | No | - |
| target | string | No | - |
| sourcePort | string | No | - |
| targetPort | string | No | - |

### Position

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| x | number | No | - |
| y | number | No | - |

### Model

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | Yes | - |
| provider | string | Yes | - |
| name | string | Yes | - |
| type | string | No | - |
| contextWindow | integer | No | - |
| inputCost | number | No | - |
| outputCost | number | No | - |
| capabilities | array | No | - |

### IntentRequest

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| message | string | Yes | - |
| context | object | No | - |

### IntentResponse

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| intent | string | No | - |
| confidence | number | No | - |
| slots | object | No | - |
| skills | array | No | - |
| parameters | object | No | - |
| chain | object | No | - |
| suggestion | string | No | - |

### CostReport

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| period | object | No | - |
| totalCost | number | No | - |
| currency | string | No | - |
| breakdown | object | No | - |
| byDay | array | No | - |

### User

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | Yes | - |
| email | string | Yes | - |
| name | string | No | - |
| role | string | No | - |
| workspace | string | No | - |
| createdAt | string | No | - |

### Workspace

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| id | string | Yes | - |
| name | string | Yes | - |
| description | string | No | - |
| plan | string | No | - |
| settings | object | No | - |
| owner | string | No | - |
| createdAt | string | No | - |

### ComplianceReport

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| framework | string | No | - |
| scope | string | No | - |
| status | string | No | - |
| controls | array | No | - |
| summary | object | No | - |

### ComplianceControl

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| controlId | string | No | - |
| controlName | string | No | - |
| category | string | No | - |
| status | string | No | - |
| findings | array | No | - |

### Error

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| code | string | Yes | - |
| message | string | Yes | - |
| details | array | No | - |

### Pagination

| Property | Type | Required | Description |
|---------|------|---------|-------------|
| total | integer | No | - |
| limit | integer | No | - |
| offset | integer | No | - |
| hasMore | boolean | No | - |

