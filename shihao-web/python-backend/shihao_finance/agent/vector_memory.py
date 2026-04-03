"""
Vector Memory System
向量数据库增强记忆系统 - 基于语义相似度的记忆检索
"""

import json
import os
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from threading import Lock
import numpy as np


@dataclass
class MemoryEntry:
    """记忆条目"""

    id: str
    content: str
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    accessed_at: Optional[str] = None
    access_count: int = 0
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "accessed_at": self.accessed_at,
            "access_count": self.access_count,
            "tags": self.tags,
        }


class EmbeddingModel:
    """
    嵌入模型接口
    支持多种嵌入后端
    """

    def __init__(self, model_type: str = "simple"):
        self.model_type = model_type
        self._model = None

    def load_model(self):
        """加载模型"""
        if self.model_type == "simple":
            # 使用简单的TF-IDF风格嵌入
            self._model = "simple"
        elif self.model_type == "openai":
            try:
                import openai

                self._model = openai
            except ImportError:
                print("Warning: openai not installed, falling back to simple embedding")
                self._model = "simple"
        elif self.model_type == "sentence-transformers":
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer("all-MiniLM-L6-v2")
            except ImportError:
                print(
                    "Warning: sentence-transformers not installed, falling back to simple embedding"
                )
                self._model = "simple"
        else:
            self._model = "simple"

    def embed(self, text: str) -> List[float]:
        """生成文本嵌入"""
        if self._model is None:
            self.load_model()

        if self._model == "simple":
            return self._simple_embed(text)
        elif self.model_type == "openai":
            return self._openai_embed(text)
        elif self.model_type == "sentence-transformers":
            return self._st_embed(text)

        return self._simple_embed(text)

    def _simple_embed(self, text: str, dimension: int = 128) -> List[float]:
        """简单嵌入（基于字符哈希）"""
        # 使用字符的哈希值生成伪嵌入
        text_bytes = text.encode("utf-8")
        np.random.seed(int(hashlib.md5(text_bytes).hexdigest()[:8], 16))
        embedding = np.random.randn(dimension).tolist()
        # 归一化
        norm = np.linalg.norm(embedding)
        return (np.array(embedding) / norm).tolist()

    def _openai_embed(self, text: str) -> List[float]:
        """OpenAI嵌入"""
        response = self._model.Embedding.create(
            input=text, model="text-embedding-ada-002"
        )
        return response["data"][0]["embedding"]

    def _st_embed(self, text: str) -> List[float]:
        """Sentence Transformers嵌入"""
        return self._model.encode(text).tolist()


class VectorMemorySystem:
    """
    向量记忆系统

    功能:
    1. 语义记忆存储
    2. 相似度检索
    3. 记忆关联
    4. 记忆压缩与摘要
    """

    def __init__(
        self,
        embedding_model: str = "simple",
        dimension: int = 128,
        storage_dir: str = "memory/vector",
    ):
        self.dimension = dimension
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # 嵌入模型
        self.embedding_model = EmbeddingModel(embedding_model)
        self.embedding_model.load_model()

        # 记忆存储
        self.memories: Dict[str, MemoryEntry] = {}

        # 向量索引（简化版，生产环境应使用FAISS或Pinecone）
        self.vectors: Dict[str, np.ndarray] = {}

        self._lock = Lock()

    def add_memory(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> str:
        """添加记忆"""
        with self._lock:
            # 生成ID
            memory_id = hashlib.md5(content.encode()).hexdigest()[:12]

            # 生成嵌入
            embedding = self.embedding_model.embed(content)

            # 创建记忆条目
            entry = MemoryEntry(
                id=memory_id,
                content=content,
                embedding=embedding,
                metadata=metadata or {},
                tags=tags or [],
            )

            # 存储
            self.memories[memory_id] = entry
            self.vectors[memory_id] = np.array(embedding)

            return memory_id

    def search(
        self, query: str, top_k: int = 5, threshold: float = 0.5
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """语义搜索记忆"""
        with self._lock:
            if not self.memories:
                return []

            # 生成查询嵌入
            query_embedding = np.array(self.embedding_model.embed(query))

            # 计算相似度
            similarities = []
            for memory_id, vector in self.vectors.items():
                # 余弦相似度
                similarity = np.dot(query_embedding, vector) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(vector)
                )

                if similarity >= threshold:
                    similarities.append((memory_id, float(similarity)))

            # 按相似度排序
            similarities.sort(key=lambda x: x[1], reverse=True)

            # 返回top_k结果
            results = []
            for memory_id, similarity in similarities[:top_k]:
                entry = self.memories[memory_id]
                entry.accessed_at = datetime.now().isoformat()
                entry.access_count += 1

                results.append((memory_id, similarity, entry.to_dict()))

            return results

    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """获取特定记忆"""
        with self._lock:
            entry = self.memories.get(memory_id)
            if entry:
                entry.accessed_at = datetime.now().isoformat()
                entry.access_count += 1
                return entry.to_dict()
            return None

    def update_memory(
        self,
        memory_id: str,
        content: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """更新记忆"""
        with self._lock:
            if memory_id not in self.memories:
                return False

            entry = self.memories[memory_id]

            if content:
                entry.content = content
                # 重新生成嵌入
                new_embedding = self.embedding_model.embed(content)
                entry.embedding = new_embedding
                self.vectors[memory_id] = np.array(new_embedding)

            if metadata:
                entry.metadata.update(metadata)

            if tags is not None:
                entry.tags = tags

            return True

    def delete_memory(self, memory_id: str) -> bool:
        """删除记忆"""
        with self._lock:
            if memory_id not in self.memories:
                return False

            del self.memories[memory_id]
            if memory_id in self.vectors:
                del self.vectors[memory_id]

            return True

    def search_by_tag(self, tag: str) -> List[Dict[str, Any]]:
        """按标签搜索"""
        with self._lock:
            results = []
            for entry in self.memories.values():
                if tag in entry.tags:
                    results.append(entry.to_dict())
            return results

    def get_related_memories(
        self, memory_id: str, top_k: int = 3
    ) -> List[Tuple[str, float, Dict[str, Any]]]:
        """获取相关记忆"""
        entry = self.memories.get(memory_id)
        if not entry or not entry.content:
            return []

        # 使用当前记忆的内容进行搜索
        return self.search(entry.content, top_k=top_k + 1)[1:]  # 排除自身

    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._lock:
            total_access = sum(e.access_count for e in self.memories.values())

            # 标签统计
            tag_counts = {}
            for entry in self.memories.values():
                for tag in entry.tags:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

            return {
                "total_memories": len(self.memories),
                "dimension": self.dimension,
                "total_access_count": total_access,
                "average_access": total_access / len(self.memories)
                if self.memories
                else 0,
                "tag_counts": tag_counts,
            }

    def save(self, filename: Optional[str] = None) -> str:
        """保存记忆到磁盘"""
        if filename is None:
            filename = f"memory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        filepath = os.path.join(self.storage_dir, filename)

        with self._lock:
            data = {
                "dimension": self.dimension,
                "memories": {k: v.to_dict() for k, v in self.memories.items()},
                "vectors": {k: v.tolist() for k, v in self.vectors.items()},
            }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return filepath

    def load(self, filename: str) -> bool:
        """从磁盘加载记忆"""
        filepath = os.path.join(self.storage_dir, filename)

        if not os.path.exists(filepath):
            return False

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            with self._lock:
                self.dimension = data.get("dimension", self.dimension)

                # 恢复记忆
                for k, v in data.get("memories", {}).items():
                    self.memories[k] = MemoryEntry(
                        id=v["id"],
                        content=v["content"],
                        metadata=v.get("metadata", {}),
                        created_at=v.get("created_at", ""),
                        accessed_at=v.get("accessed_at"),
                        access_count=v.get("access_count", 0),
                        tags=v.get("tags", []),
                    )

                # 恢复向量
                for k, v in data.get("vectors", {}).items():
                    self.vectors[k] = np.array(v)

            return True
        except Exception as e:
            print(f"Error loading memory: {e}")
            return False

    def clear(self):
        """清空所有记忆"""
        with self._lock:
            self.memories.clear()
            self.vectors.clear()


# 全局向量记忆实例
_global_vector_memory: Optional[VectorMemorySystem] = None


def get_vector_memory() -> VectorMemorySystem:
    """获取全局向量记忆实例"""
    global _global_vector_memory
    if _global_vector_memory is None:
        _global_vector_memory = VectorMemorySystem()
    return _global_vector_memory


def add_semantic_memory(
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None,
) -> str:
    """便捷函数：添加语义记忆"""
    memory = get_vector_memory()
    return memory.add_memory(content, metadata, tags)


def search_semantic_memory(
    query: str, top_k: int = 5
) -> List[Tuple[str, float, Dict[str, Any]]]:
    """便捷函数：语义搜索记忆"""
    memory = get_vector_memory()
    return memory.search(query, top_k)
