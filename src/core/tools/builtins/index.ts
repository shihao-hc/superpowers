/**
 * 内置工具索引
 */

export { grepTool } from './grep.js';
export { readTool } from './read.js';
export { writeTool } from './write.js';
export { bashTool } from './bash.js';
export { findTool } from './find.js';
export { editTool } from './edit.js';

import { grepTool } from './grep.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { bashTool } from './bash.js';
import { findTool } from './find.js';
import { editTool } from './edit.js';

export const builtinTools = {
  grep: grepTool,
  read: readTool,
  write: writeTool,
  bash: bashTool,
  find: findTool,
  edit: editTool
};
