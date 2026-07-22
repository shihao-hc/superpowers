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
    it('should have file read operations as readOnly', () => {
      expect(ANNOTATIONS.read_text_file.readOnlyHint).toBe(true);
      expect(ANNOTATIONS.read_text_file.idempotentHint).toBe(true);
      expect(ANNOTATIONS.read_text_file.destructiveHint).toBe(false);
    });

    it('should have file write operations as destructive', () => {
      expect(ANNOTATIONS.write_file.readOnlyHint).toBe(false);
      expect(ANNOTATIONS.write_file.destructiveHint).toBe(true);
    });

    it('should have GitHub read operations as readOnly', () => {
      expect(ANNOTATIONS.list_repositories.readOnlyHint).toBe(true);
    });

    it('should have browser operations as non-readOnly', () => {
      expect(ANNOTATIONS.navigate.readOnlyHint).toBe(false);
    });

    it('should have generic operations', () => {
      expect(ANNOTATIONS.exec_cmd.destructiveHint).toBe(true);
      expect(ANNOTATIONS.read_url.readOnlyHint).toBe(true);
    });
  });

  describe('getAnnotation', () => {
    it('should return annotation for known tool', () => {
      const anno = getAnnotation('write_file');
      expect(anno.readOnlyHint).toBe(false);
      expect(anno.destructiveHint).toBe(true);
    });

    it('should return safe default for unknown tool', () => {
      const anno = getAnnotation('unknown_tool');
      expect(anno.readOnlyHint).toBe(true);
      expect(anno.idempotentHint).toBe(true);
      expect(anno.destructiveHint).toBe(false);
    });
  });

  describe('isReadOnly', () => {
    it('should return true for read operations', () => {
      expect(isReadOnly('read_text_file')).toBe(true);
      expect(isReadOnly('list_repositories')).toBe(true);
    });

    it('should return false for write operations', () => {
      expect(isReadOnly('write_file')).toBe(false);
      expect(isReadOnly('delete_file')).toBe(false);
    });

    it('should return true for unknown operations', () => {
      expect(isReadOnly('unknown')).toBe(true);
    });
  });

  describe('isIdempotent', () => {
    it('should return true for idempotent operations', () => {
      expect(isIdempotent('read_text_file')).toBe(true);
      expect(isIdempotent('write_file')).toBe(true);
      expect(isIdempotent('create_directory')).toBe(true);
    });

    it('should return false for non-idempotent operations', () => {
      expect(isIdempotent('edit_file')).toBe(false);
      expect(isIdempotent('delete_file')).toBe(false);
    });

    it('should return true for unknown operations', () => {
      expect(isIdempotent('unknown')).toBe(true);
    });
  });

  describe('isDestructive', () => {
    it('should return true for destructive operations', () => {
      expect(isDestructive('write_file')).toBe(true);
      expect(isDestructive('delete_file')).toBe(true);
      expect(isDestructive('exec_cmd')).toBe(true);
    });

    it('should return false for non-destructive operations', () => {
      expect(isDestructive('read_text_file')).toBe(false);
      expect(isDestructive('list_repositories')).toBe(false);
    });

    it('should return false for unknown operations', () => {
      expect(isDestructive('unknown')).toBe(false);
    });
  });

  describe('getRiskLevel', () => {
    it('should return safe for read-only operations', () => {
      expect(getRiskLevel('read_text_file')).toBe('safe');
      expect(getRiskLevel('list_repositories')).toBe('safe');
    });

    it('should return critical for destructive operations', () => {
      expect(getRiskLevel('write_file')).toBe('critical');
      expect(getRiskLevel('delete_file')).toBe('critical');
    });

    it('should return medium for non-idempotent operations', () => {
      expect(getRiskLevel('navigate')).toBe('medium');
      expect(getRiskLevel('evaluate')).toBe('medium');
    });

    it('should return low for non-readOnly, non-destructive, idempotent', () => {
      expect(getRiskLevel('create_issue')).toBe('low');
      expect(getRiskLevel('create_directory')).toBe('low');
    });

    it('should return safe for unknown operations', () => {
      expect(getRiskLevel('unknown')).toBe('safe');
    });
  });

  describe('annotateTool', () => {
    it('should add annotations to tool definition', () => {
      const result = annotateTool({ name: 'write_file', description: 'Write a file' }, 'write_file');
      expect(result.name).toBe('write_file');
      expect(result.annotations).toEqual({ readOnlyHint: false, idempotentHint: true, destructiveHint: true });
    });

    it('should preserve existing tool properties', () => {
      const result = annotateTool({ name: 'read', params: { x: 1 } }, 'read_text_file');
      expect(result.params).toEqual({ x: 1 });
    });

    it('should add default annotations for unknown tool', () => {
      const result = annotateTool({ name: 'my_tool' }, 'my_tool');
      expect(result.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    });
  });

  describe('annotateTools', () => {
    it('should annotate a list of tools', () => {
      const tools = [
        { name: 'read_text_file' },
        { name: 'write_file' },
        { name: 'unknown_tool' }
      ];
      const results = annotateTools(tools);
      expect(results).toHaveLength(3);
      expect(results[0].annotations.readOnlyHint).toBe(true);
      expect(results[1].annotations.readOnlyHint).toBe(false);
      expect(results[2].annotations.readOnlyHint).toBe(true);
    });

    it('should return empty array for empty input', () => {
      expect(annotateTools([])).toEqual([]);
    });
  });
});
