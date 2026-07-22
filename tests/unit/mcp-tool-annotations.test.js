const {
  ANNOTATIONS,
  getAnnotation,
  isReadOnly,
  isIdempotent,
  isDestructive,
  getRiskLevel,
  annotateTool,
  annotateTools
} = require('../../src/mcp/engines/ToolAnnotations');

describe('ToolAnnotations', () => {
  describe('ANNOTATIONS', () => {
    it('contains known file tools', () => {
      expect(ANNOTATIONS.read_text_file).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
      expect(ANNOTATIONS.write_file).toEqual({ readOnlyHint: false, idempotentHint: true, destructiveHint: true });
      expect(ANNOTATIONS.edit_file).toEqual({ readOnlyHint: false, idempotentHint: false, destructiveHint: true });
    });

    it('contains known GitHub tools', () => {
      expect(ANNOTATIONS.list_repositories).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
      expect(ANNOTATIONS.create_issue).toEqual({ readOnlyHint: false, idempotentHint: true, destructiveHint: false });
      expect(ANNOTATIONS.merge_pr).toEqual({ readOnlyHint: false, idempotentHint: false, destructiveHint: true });
    });

    it('contains all categories', () => {
      expect(ANNOTATIONS.navigate).toBeDefined();
      expect(ANNOTATIONS.query_docs).toBeDefined();
      expect(ANNOTATIONS.list_memos).toBeDefined();
      expect(ANNOTATIONS.get_current_time).toBeDefined();
    });
  });

  describe('getAnnotation', () => {
    it('returns annotation for known tool', () => {
      const ann = getAnnotation('read_text_file');
      expect(ann.readOnlyHint).toBe(true);
      expect(ann.idempotentHint).toBe(true);
      expect(ann.destructiveHint).toBe(false);
    });

    it('returns safe default for unknown tool', () => {
      const ann = getAnnotation('unknown_tool');
      expect(ann).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    });
  });

  describe('isReadOnly', () => {
    it('returns true for read-only tool', () => {
      expect(isReadOnly('read_text_file')).toBe(true);
    });

    it('returns false for writing tool', () => {
      expect(isReadOnly('write_file')).toBe(false);
    });

    it('returns true for unknown tool', () => {
      expect(isReadOnly('unknown')).toBe(true);
    });
  });

  describe('isIdempotent', () => {
    it('returns true for idempotent tool', () => {
      expect(isIdempotent('write_file')).toBe(true);
    });

    it('returns false for non-idempotent tool', () => {
      expect(isIdempotent('edit_file')).toBe(false);
    });

    it('returns true for unknown tool', () => {
      expect(isIdempotent('unknown')).toBe(true);
    });
  });

  describe('isDestructive', () => {
    it('returns true for destructive tool', () => {
      expect(isDestructive('delete_file')).toBe(true);
    });

    it('returns false for non-destructive tool', () => {
      expect(isDestructive('read_text_file')).toBe(false);
    });

    it('returns false for unknown tool', () => {
      expect(isDestructive('unknown')).toBe(false);
    });
  });

  describe('getRiskLevel', () => {
    it('returns safe for read-only tools', () => {
      expect(getRiskLevel('read_text_file')).toBe('safe');
    });

    it('returns critical for destructive tools', () => {
      expect(getRiskLevel('delete_file')).toBe('critical');
    });

    it('returns medium for non-idempotent non-destructive', () => {
      expect(getRiskLevel('update_issue')).toBe('medium');
    });

    it('returns low for write-idempotent non-destructive', () => {
      expect(getRiskLevel('create_directory')).toBe('low');
    });

    it('returns safe for unknown tool', () => {
      expect(getRiskLevel('unknown')).toBe('safe');
    });

    it('returns critical for exec_cmd', () => {
      expect(getRiskLevel('exec_cmd')).toBe('critical');
    });
  });

  describe('annotateTool', () => {
    it('adds annotation to tool definition', () => {
      const def = { name: 'read_text_file', description: 'Read' };
      const result = annotateTool(def, 'read_text_file');
      expect(result.name).toBe('read_text_file');
      expect(result.description).toBe('Read');
      expect(result.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    });

    it('adds default annotation for unknown tool', () => {
      const def = { name: 'weird' };
      const result = annotateTool(def, 'weird');
      expect(result.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    });

    it('does not mutate original definition', () => {
      const def = { name: 'read_text_file' };
      const result = annotateTool(def, 'read_text_file');
      expect(def.annotations).toBeUndefined();
      expect(result.annotations).toBeDefined();
    });
  });

  describe('annotateTools', () => {
    it('annotates a list of tools', () => {
      const tools = [
        { name: 'read_text_file' },
        { name: 'write_file' }
      ];
      const result = annotateTools(tools);
      expect(result).toHaveLength(2);
      expect(result[0].annotations.readOnlyHint).toBe(true);
      expect(result[1].annotations.readOnlyHint).toBe(false);
    });

    it('returns empty array for empty input', () => {
      expect(annotateTools([])).toEqual([]);
    });

    it('handles unknown tools in list', () => {
      const tools = [{ name: 'made_up_name' }];
      const result = annotateTools(tools);
      expect(result[0].annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    });
  });
});
