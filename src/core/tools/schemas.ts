/**
 * Tool Schemas
 * 工具输入验证模式定义
 */

export interface SchemaDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  default?: unknown;
}

export interface SchemaProperty extends SchemaDefinition {
  name?: string;
}

export class SchemaValidator {
  validate(value: unknown, schema: SchemaDefinition): ValidationResult {
    const errors: string[] = [];

    if (this.validateType(value, schema) === false) {
      errors.push(`Expected type ${schema.type}, got ${typeof value}`);
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Value must be one of: ${schema.enum.join(', ')}`);
    }

    if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
      errors.push(`Value must be >= ${schema.minimum}`);
    }

    if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
      errors.push(`Value must be <= ${schema.maximum}`);
    }

    if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
      errors.push(`String length must be >= ${schema.minLength}`);
    }

    if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
      errors.push(`String length must be <= ${schema.maxLength}`);
    }

    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push(`String must match pattern: ${schema.pattern}`);
      }
    }

    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      const objErrors = this.validateObject(value as Record<string, unknown>, schema);
      errors.push(...objErrors);
    }

    if (schema.type === 'array' && Array.isArray(value)) {
      const arrayErrors = this.validateArray(value, schema);
      errors.push(...arrayErrors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateType(value: unknown, schema: SchemaDefinition): boolean {
    if (value === null) return schema.type === 'null';
    if (schema.type === 'null') return value === null;

    switch (schema.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  private validateObject(obj: Record<string, unknown>, schema: SchemaDefinition): string[] {
    const errors: string[] = [];

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const propErrors = this.validate(obj[key], propSchema);
          if (!propErrors.valid) {
            errors.push(...propErrors.errors.map(e => `${key}: ${e}`));
          }
        }
      }
    }

    return errors;
  }

  private validateArray(arr: unknown[], schema: SchemaDefinition): string[] {
    const errors: string[] = [];

    if (schema.items) {
      arr.forEach((item, index) => {
        const itemErrors = this.validate(item, schema.items!);
        if (!itemErrors.valid) {
          errors.push(...itemErrors.errors.map(e => `[${index}]: ${e}`));
        }
      });
    }

    return errors;
  }

  parse(value: unknown, schema: SchemaDefinition): unknown {
    const validation = this.validate(value, schema);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    return this.applyDefaults(value, schema);
  }

  private applyDefaults(value: unknown, schema: SchemaDefinition): unknown {
    if (schema.default !== undefined && value === undefined) {
      return schema.default;
    }

    if (schema.type === 'object' && typeof value === 'object' && value !== null && schema.properties) {
      const result: Record<string, unknown> = { ...value as object };
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (!(key in result) && propSchema.default !== undefined) {
          result[key] = propSchema.default;
        }
      }
      return result;
    }

    return value;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const commonSchemas = {
  filePath: {
    type: 'string' as const,
    minLength: 1,
    pattern: '^[\\w\\-.\\/\\\\]+$'
  },
  directoryPath: {
    type: 'string' as const,
    minLength: 1
  },
  globPattern: {
    type: 'string' as const,
    minLength: 1
  },
  command: {
    type: 'string' as const,
    minLength: 1
  },
  commitMessage: {
    type: 'string' as const,
    minLength: 1,
    maxLength: 500
  },
  branchName: {
    type: 'string' as const,
    minLength: 1,
    pattern: '^[\\w\\-.\/]+$'
  }
};

export const globalSchemaValidator = new SchemaValidator();
