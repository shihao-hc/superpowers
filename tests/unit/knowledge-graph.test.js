const KnowledgeGraph = require('../../src/utils/KnowledgeGraph');

const makeLesson = (id, lesson, category, problem = '', priority = 'medium', applied = false) => ({
  id,
  lesson,
  category,
  problem,
  priority,
  applied,
});

describe('KnowledgeGraph.buildKnowledgeGraph', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('returns empty graph when no lessons', () => {
    const bs = { lessonLibrary: { search: jest.fn().mockReturnValue([]) } };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph).toEqual({ nodes: [], edges: [], clusters: [] });
    expect(bs.lessonLibrary.search).toHaveBeenCalledWith('', { limit: 100 });
  });

  test('builds nodes from lessons with truncated labels', () => {
    const longLesson = 'X'.repeat(50);
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          makeLesson('l1', longLesson, 'security', 'problem text', 'high', true),
          makeLesson('l2', 'short', 'general'),
        ]),
      },
    };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]).toEqual({
      id: 'l1',
      label: `${longLesson.substring(0, 30)}...`,
      category: 'security',
      priority: 'high',
      applied: true,
    });
  });

  test('adds edge between similar lessons', () => {
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          makeLesson('l1', '', 'security', 'password encryption'),
          makeLesson('l2', '', 'security', 'password encryption'),
        ]),
      },
    };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph.edges.length).toBeGreaterThan(0);
    const edge = graph.edges[0];
    expect(edge).toHaveProperty('source');
    expect(edge).toHaveProperty('target');
    expect(edge.weight).toBeGreaterThan(0);
    expect(edge.weight).toBeLessThanOrEqual(100);
  });

  test('does not add edge for dissimilar lessons', () => {
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          makeLesson('l1', 'about pet care', 'general', 'dog feeding walking'),
          makeLesson('l2', 'about stock analysis', 'finance', 'stock trading market'),
        ]),
      },
    };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph.edges).toEqual([]);
  });

  test('groups lessons into clusters by category', () => {
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          makeLesson('a', 'x', 'security'),
          makeLesson('b', 'y', 'security'),
          makeLesson('c', 'z', 'performance'),
        ]),
      },
    };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph.clusters).toEqual([
      { category: 'security', nodeIds: ['a', 'b'], size: 2 },
      { category: 'performance', nodeIds: ['c'], size: 1 },
    ]);
  });

  test('uses general category for missing category', () => {
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          { id: 'n', lesson: 'no category' },
        ]),
      },
    };
    const graph = KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(graph.clusters).toEqual([{ category: 'general', nodeIds: ['n'], size: 1 }]);
  });

  test('logs summary line', () => {
    const bs = {
      lessonLibrary: {
        search: jest.fn().mockReturnValue([
          makeLesson('a', 'x', 'security'),
          makeLesson('b', 'y', 'performance'),
        ]),
      },
    };
    KnowledgeGraph.buildKnowledgeGraph(bs);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('知识图谱: 2 节点')
    );
  });
});
