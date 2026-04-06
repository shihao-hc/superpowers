/**
 * Command Parser
 * 命令解析和参数提取
 */

export interface ParsedCommand {
  name: string;
  args: string[];
  flags: Record<string, string | boolean>;
  raw: string;
}

export class CommandParser {
  parse(input: string): ParsedCommand {
    const trimmed = input.trim();
    
    if (!trimmed.startsWith('/')) {
      return {
        name: '',
        args: [],
        flags: {},
        raw: trimmed
      };
    }

    const withoutSlash = trimmed.slice(1);
    const parts = this.splitArgs(withoutSlash);
    
    const name = parts[0] || '';
    const argParts = parts.slice(1);
    
    const { args, flags } = this.parseArgsAndFlags(argParts);

    return {
      name: name.toLowerCase(),
      args,
      flags,
      raw: trimmed
    };
  }

  private splitArgs(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }

      if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
        continue;
      }

      if (char === ' ' && !inQuotes) {
        if (current.length > 0) {
          parts.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      parts.push(current);
    }

    return parts;
  }

  private parseArgsAndFlags(parts: string[]): { args: string[]; flags: Record<string, string | boolean> } {
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('--')) {
        const flagName = part.slice(2);
        const nextPart = parts[i + 1];

        if (nextPart && !nextPart.startsWith('-')) {
          flags[flagName] = nextPart;
          i++;
        } else {
          flags[flagName] = true;
        }
      } else if (part.startsWith('-')) {
        const flagName = part.slice(1);
        const nextPart = parts[i + 1];

        if (nextPart && !nextPart.startsWith('-')) {
          flags[flagName] = nextPart;
          i++;
        } else {
          flags[flagName] = true;
        }
      } else {
        args.push(part);
      }
    }

    return { args, flags };
  }

  formatHelp(command: { name: string; description: string; aliases?: string[] }): string {
    let help = `# /${command.name}`;

    if (command.aliases && command.aliases.length > 0) {
      help += ` (alias: ${command.aliases.map(a => `/${a}`).join(', ')})`;
    }

    help += `\n${command.description}\n`;
    return help;
  }

  validateArgs(
    args: string[],
    schema: ArgumentSchema
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (schema.minArgs !== undefined && args.length < schema.minArgs) {
      errors.push(`Minimum ${schema.minArgs} arguments required, got ${args.length}`);
    }

    if (schema.maxArgs !== undefined && args.length > schema.maxArgs) {
      errors.push(`Maximum ${schema.maxArgs} arguments allowed, got ${args.length}`);
    }

    if (schema.types) {
      for (let i = 0; i < args.length && i < schema.types.length; i++) {
        const expected = schema.types[i];
        const actual = args[i];

        if (expected === 'number' && isNaN(Number(actual))) {
          errors.push(`Argument ${i + 1} should be a number, got "${actual}"`);
        }
        if (expected === 'path' && !this.isValidPath(actual)) {
          errors.push(`Argument ${i + 1} should be a valid path, got "${actual}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private isValidPath(path: string): boolean {
    return /^[\w\-.\\\/]+$/.test(path);
  }
}

export interface ArgumentSchema {
  minArgs?: number;
  maxArgs?: number;
  types?: ('string' | 'number' | 'path')[];
}

export const globalCommandParser = new CommandParser();
