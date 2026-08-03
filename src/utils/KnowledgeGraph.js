const BrainUtils = require('./BrainUtils');

class KnowledgeGraph {
  buildKnowledgeGraph(bs) {
    const graph = {
      nodes: [],
      edges: [],
      clusters: []
    };

    const lessons = bs.lessonLibrary.search('', { limit: 100 });

    for (const lesson of lessons) {
      graph.nodes.push({
        id: lesson.id,
        label: `${lesson.lesson.substring(0, 30)}...`,
        category: lesson.category,
        priority: lesson.priority,
        applied: lesson.applied
      });
    }

    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        const similarity = BrainUtils._calculateLessonRelevance(lessons[i].problem, lessons[j]);

        if (similarity > 0.5) {
          graph.edges.push({
            source: lessons[i].id,
            target: lessons[j].id,
            weight: Math.round(similarity * 100)
          });
        }
      }
    }

    const categoryGroups = {};
    for (const lesson of lessons) {
      const cat = lesson.category || 'general';
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = [];
      }
      categoryGroups[cat].push(lesson.id);
    }

    graph.clusters = Object.entries(categoryGroups).map(([category, nodeIds]) => ({
      category,
      nodeIds,
      size: nodeIds.length
    }));

    console.log(`[BrainSystem] 知识图谱: ${graph.nodes.length} 节点, ${graph.edges.length} 边, ${graph.clusters.length} 聚类`);

    return graph;
  }
}

module.exports = new KnowledgeGraph();
