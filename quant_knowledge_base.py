"""
QuantKnowledgeBase: Vector-based knowledge base for quantitative strategies.
- Stores strategy code, factor definitions, backtest reports
- Provides semantic search and Q&A interface
- Uses embeddings + vector database for retrieval
"""
from __future__ import annotations

import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import pandas as pd
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False

try:
    import chromadb
    from chromadb.config import Settings
    HAS_CHROMADB = True
except ImportError:
    HAS_CHROMADB = False


@dataclass
class KnowledgeItem:
    """Single knowledge base entry."""
    id: str
    type: str  # "strategy", "factor", "backtest", "doc"
    title: str
    content: str
    metadata: Dict[str, Any]
    created_at: str
    embedding: Optional[List[float]] = None


class EmbeddingProvider:
    """Base class for embedding providers."""

    def encode(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


class SentenceTransformerProvider(EmbeddingProvider):
    """SentenceTransformer-based embedding provider."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        if not HAS_SENTENCE_TRANSFORMERS:
            raise ImportError("sentence-transformers not installed")
        self.model = SentenceTransformer(model_name)

    def encode(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()


class MockEmbeddingProvider(EmbeddingProvider):
    """Mock embedding provider for testing without dependencies."""

    def __init__(self, dim: int = 384):
        self.dim = dim

    def encode(self, texts: List[str]) -> List[List[float]]:
        np.random.seed(42)
        return [np.random.randn(self.dim).tolist() for _ in texts]


class VectorStore:
    """Base vector store interface."""

    def add(self, ids: List[str], embeddings: List[List[float]], metadatas: List[Dict], documents: List[str]) -> None:
        raise NotImplementedError

    def query(self, query_embedding: List[float], top_k: int = 5) -> Dict:
        raise NotImplementedError

    def delete(self, ids: List[str]) -> None:
        raise NotImplementedError


class ChromaVectorStore(VectorStore):
    """ChromaDB-based vector store."""

    def __init__(self, collection_name: str = "quant_kb", persist_directory: str = "./chroma_db"):
        if not HAS_CHROMADB:
            raise ImportError("chromadb not installed")

        self.client = chromadb.Client(Settings(
            persist_directory=persist_directory,
            anonymized_telemetry=False
        ))
        self.collection = self.client.get_or_create_collection(name=collection_name)

    def add(self, ids: List[str], embeddings: List[List[float]], metadatas: List[Dict], documents: List[str]) -> None:
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )

    def query(self, query_embedding: List[float], top_k: int = 5) -> Dict:
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )
        return {
            "ids": results.get("ids", [[]])[0],
            "documents": results.get("documents", [[]])[0],
            "metadatas": results.get("metadatas", [[]])[0],
            "distances": results.get("distances", [[]])[0],
        }

    def delete(self, ids: List[str]) -> None:
        self.collection.delete(ids=ids)


class InMemoryVectorStore(VectorStore):
    """In-memory vector store for testing or small datasets."""

    def __init__(self, embedding_dim: int = 384):
        self.embedding_dim = embedding_dim
        self.ids = []
        self.embeddings = []
        self.metadatas = []
        self.documents = []

    def add(self, ids: List[str], embeddings: List[List[float]], metadatas: List[Dict], documents: List[str]) -> None:
        self.ids.extend(ids)
        self.embeddings.extend(embeddings)
        self.metadatas.extend(metadatas)
        self.documents.extend(documents)

    def query(self, query_embedding: List[float], top_k: int = 5) -> Dict:
        if not self.embeddings:
            return {"ids": [], "documents": [], "metadatas": [], "distances": []}

        # Compute cosine similarity
        query = np.array(query_embedding)
        scores = []
        for emb in self.embeddings:
            cos_sim = np.dot(query, np.array(emb)) / (np.linalg.norm(query) * np.linalg.norm(np.array(emb)) + 1e-9)
            scores.append(cos_sim)

        # Get top-k indices
        top_indices = np.argsort(scores)[::-1][:top_k]

        return {
            "ids": [self.ids[i] for i in top_indices],
            "documents": [self.documents[i] for i in top_indices],
            "metadatas": [self.metadatas[i] for i in top_indices],
            "distances": [1 - scores[i] for i in top_indices],  # distance = 1 - similarity
        }

    def delete(self, ids: List[str]) -> None:
        indices = [i for i, pid in enumerate(self.ids) if pid in ids]
        for i in sorted(indices, reverse=True):
            del self.ids[i]
            del self.embeddings[i]
            del self.metadatas[i]
            del self.documents[i]


class QuantKnowledgeBase:
    """
    Vector-based knowledge base for quantitative finance.
    Supports storing strategies, factors, backtest reports with semantic search.
    """

    def __init__(
        self,
        embedding_provider: Optional[EmbeddingProvider] = None,
        vector_store: Optional[VectorStore] = None,
        use_chroma: bool = False,
    ):
        if embedding_provider is None:
            if HAS_SENTENCE_TRANSFORMERS:
                self.embedding_provider = SentenceTransformerProvider()
            else:
                self.embedding_provider = MockEmbeddingProvider()
        else:
            self.embedding_provider = embedding_provider

        if vector_store is None:
            if use_chroma and HAS_CHROMADB:
                self.vector_store = ChromaVectorStore()
            else:
                self.vector_store = InMemoryVectorStore()
        else:
            self.vector_store = vector_store

        self.items = {}  # id -> KnowledgeItem

    def _generate_id(self, content: str) -> str:
        return hashlib.md5(content.encode()).hexdigest()[:12]

    def add_strategy(self, code: str, name: str, metadata: Optional[Dict] = None) -> str:
        """Add a strategy to the knowledge base."""
        content = f"Strategy: {name}\n\nCode:\n{code}"
        item_id = self._generate_id(content)
        metadata = metadata or {}
        metadata.update({"type": "strategy", "name": name})

        self._add_item(item_id, "strategy", name, content, metadata)
        return item_id

    def add_factor(self, definition: str, name: str, metadata: Optional[Dict] = None) -> str:
        """Add a factor definition."""
        content = f"Factor: {name}\n\nDefinition:\n{definition}"
        item_id = self._generate_id(content)
        metadata = metadata or {}
        metadata.update({"type": "factor", "name": name})

        self._add_item(item_id, "factor", name, content, metadata)
        return item_id

    def add_backtest_report(self, report_text: str, strategy_name: str, metadata: Optional[Dict] = None) -> str:
        """Add a backtest report."""
        content = f"Backtest Report for {strategy_name}\n\n{report_text}"
        item_id = self._generate_id(content)
        metadata = metadata or {}
        metadata.update({"type": "backtest", "strategy": strategy_name})

        self._add_item(item_id, "backtest", f"Backtest: {strategy_name}", content, metadata)
        return item_id

    def add_document(self, text: str, title: str, metadata: Optional[Dict] = None) -> str:
        """Add a general document."""
        content = text
        item_id = self._generate_id(content)
        metadata = metadata or {}
        metadata.update({"type": "doc", "title": title})

        self._add_item(item_id, "doc", title, content, metadata)
        return item_id

    def _add_item(self, item_id: str, item_type: str, title: str, content: str, metadata: Dict) -> None:
        """Internal method to add an item to the knowledge base."""
        created_at = datetime.utcnow().isoformat()

        # Generate embedding
        embedding = self.embedding_provider.encode([content])[0]

        item = KnowledgeItem(
            id=item_id,
            type=item_type,
            title=title,
            content=content,
            metadata=metadata,
            created_at=created_at,
            embedding=embedding,
        )

        self.items[item_id] = item

        # Add to vector store
        self.vector_store.add(
            ids=[item_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[content],
        )

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Semantic search over the knowledge base."""
        query_embedding = self.embedding_provider.encode([query])[0]

        results = self.vector_store.query(query_embedding, top_k=top_k)

        search_results = []
        for i, doc_id in enumerate(results["ids"]):
            search_results.append({
                "id": doc_id,
                "content": results["documents"][i],
                "metadata": results["metadatas"][i],
                "distance": results["distances"][i],
            })

        return search_results

    def get_by_id(self, item_id: str) -> Optional[KnowledgeItem]:
        """Retrieve a specific item by ID."""
        return self.items.get(item_id)

    def list_items(self, item_type: Optional[str] = None) -> List[KnowledgeItem]:
        """List all items, optionally filtered by type."""
        items = list(self.items.values())
        if item_type:
            items = [item for item in items if item.type == item_type]
        return items

    def delete_item(self, item_id: str) -> None:
        """Delete an item from the knowledge base."""
        if item_id in self.items:
            del self.items[item_id]
            self.vector_store.delete([item_id])

    def export_json(self, filepath: str) -> None:
        """Export knowledge base to JSON."""
        data = {
            "exported_at": datetime.utcnow().isoformat(),
            "items": [asdict(item) for item in self.items.values()]
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def import_json(self, filepath: str) -> None:
        """Import knowledge base from JSON."""
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        for item_dict in data.get("items", []):
            item = KnowledgeItem(**item_dict)
            self.items[item.id] = item
            # Re-add to vector store
            self.vector_store.add(
                ids=[item.id],
                embeddings=[item.embedding],
                metadatas=[item.metadata],
                documents=[item.content],
            )


class KnowledgeBaseQA:
    """Q&A interface over the knowledge base."""

    def __init__(self, kb: QuantKnowledgeBase, llm_client=None):
        self.kb = kb
        self.llm_client = llm_client

    def ask(self, question: str, top_k: int = 3) -> Dict:
        """Ask a question and get an answer with sources."""
        # Search relevant documents
        results = self.kb.search(question, top_k=top_k)

        if not results:
            return {
                "question": question,
                "answer": "抱歉，知识库中没有找到相关信息。",
                "sources": []
            }

        # Build context from top results
        context = "\n\n".join([
            f"[{r['metadata'].get('type', 'doc')}] {r['content'][:500]}"
            for r in results
        ])

        if self.llm_client:
            prompt = f"""基于以下知识库内容回答问题。如果知识库中没有相关信息，请说明找不到相关内容。

知识库内容:
{context}

问题: {question}

回答:"""
            try:
                response = self.llm_client.complete(prompt)
                answer = response.text if hasattr(response, 'text') else str(response)
            except Exception as e:
                answer = f"LLM调用失败: {e}"
        else:
            # Simple template answer without LLM
            answer = f"根据搜索结果，以下是相关知识:\n\n"
            for r in results[:3]:
                answer += f"- {r['content'][:200]}...\n\n"

        return {
            "question": question,
            "answer": answer,
            "sources": [
                {"id": r["id"], "metadata": r["metadata"]}
                for r in results
            ]
        }


class RAGEngine:
    """
    Retrieval-Augmented Generation engine for quant knowledge base.
    Combines vector search with LLM for enhanced Q&A.
    """

    def __init__(self, kb: QuantKnowledgeBase, llm_client=None):
        self.kb = kb
        self.llm_client = llm_client
        self.max_context_length = 4000
        self.retrieval_top_k = 5

    def _truncate_context(self, context: str) -> str:
        """Truncate context to fit in LLM context window."""
        if len(context) <= self.max_context_length:
            return context
        return context[:self.max_context_length] + "...(truncated)"

    def _build_prompt(self, question: str, context: str) -> str:
        """Build RAG prompt."""
        truncated_context = self._truncate_context(context)
        return f"""你是一个专业的量化金融助手。请基于以下参考资料回答用户问题。

参考资料:
{truncated_context}

问题: {question}

请给出专业、详细的回答。如果参考资料不足以回答问题，请明确说明。"""

    def query(
        self,
        question: str,
        filter_types: Optional[List[str]] = None,
        use_rag: bool = True
    ) -> Dict:
        """
        Query the RAG engine.
        
        Args:
            question: User question
            filter_types: Filter by knowledge types (strategy, factor, backtest)
            use_rag: Whether to use LLM for generation
        
        Returns:
            Dict with answer, sources, and metadata
        """
        # Step 1: Retrieve relevant documents
        if filter_types:
            all_results = []
            for ft in filter_types:
                results = self.kb.search(question, top_k=self.retrieval_top_k)
                filtered = [r for r in results if r['metadata'].get('type') == ft]
                all_results.extend(filtered)
            # Deduplicate and rerank
            seen = set()
            results = []
            for r in all_results:
                if r['id'] not in seen:
                    seen.add(r['id'])
                    results.append(r)
        else:
            results = self.kb.search(question, top_k=self.retrieval_top_k)

        if not results:
            return {
                "question": question,
                "answer": "抱歉，知识库中没有找到相关信息。",
                "sources": [],
                "rag_enabled": use_rag
            }

        # Step 2: Build context
        context_parts = []
        for r in results:
            content = r['content'][:1000]  # Limit each source
            context_parts.append(f"[{r['metadata'].get('type', 'doc')}] {content}")

        context = "\n\n".join(context_parts)

        # Step 3: Generate answer
        if use_rag and self.llm_client:
            prompt = self._build_prompt(question, context)
            try:
                response = self.llm_client.complete(prompt)
                answer = response.text if hasattr(response, 'text') else str(response)
            except Exception as e:
                answer = f"LLM生成失败: {e}"
        else:
            # Fallback without LLM
            answer = self._fallback_answer(question, results)

        return {
            "question": question,
            "answer": answer,
            "sources": [
                {
                    "id": r["id"],
                    "type": r["metadata"].get("type"),
                    "title": r["metadata"].get("name", r["metadata"].get("title")),
                    "relevance": 1.0 - r.get("distance", 0)
                }
                for r in results
            ],
            "context": context[:500] + "..." if len(context) > 500 else context,
            "rag_enabled": use_rag
        }

    def _fallback_answer(self, question: str, results: List[Dict]) -> str:
        """Generate fallback answer without LLM."""
        answer = f"根据知识库搜索结果，找到 {len(results)} 条相关信息：\n\n"

        for i, r in enumerate(results, 1):
            ans_type = r['metadata'].get('type', 'doc')
            ans_title = r['metadata'].get('name', r['metadata'].get('title', 'N/A'))
            content = r['content'][:300]

            answer += f"{i}. [{ans_type}] {ans_title}\n"
            answer += f"   {content}...\n\n"

        answer += "如需更详细的解释，请补充更多背景信息或联系系统管理员。"

        return answer


class FactorEncyclopedia:
    """
    Factor encyclopedia for storing and retrieving factor definitions.
    """

    def __init__(self, kb: QuantKnowledgeBase):
        self.kb = kb

    def add_factor(
        self,
        name: str,
        definition: str,
        formula: str,
        category: str,
        author: str = "system",
        tags: Optional[List[str]] = None
    ) -> str:
        """Add a factor to the encyclopedia."""
        content = f"""# {name}

## 定义
{Definition}

## 计算公式
```
{formula}
```

## 类别
{category}

## 使用说明
请添加使用说明

## 注意事项
请添加注意事项
"""
        metadata = {
            "type": "factor",
            "name": name,
            "category": category,
            "author": author,
            "tags": tags or []
        }

        return self.kb.add_factor(content, name, metadata)

    def search_factors(self, query: str, category: Optional[str] = None) -> List[Dict]:
        """Search factors."""
        results = self.kb.search(query, top_k=10)
        filtered = [r for r in results if r['metadata'].get('type') == 'factor']

        if category:
            filtered = [r for r in filtered if r['metadata'].get('category') == category]

        return filtered

    def get_factor(self, name: str) -> Optional[Dict]:
        """Get factor by name."""
        items = self.kb.list_items('factor')
        for item in items:
            if item.metadata.get('name') == name:
                return {
                    "name": item.title,
                    "content": item.content,
                    "metadata": item.metadata
                }
        return None


class StrategyVersionManager:
    """
    Strategy version manager for tracking strategy changes and backtest results.
    """

    def __init__(self, kb: QuantKnowledgeBase):
        self.kb = kb

    def register_strategy_version(
        self,
        strategy_name: str,
        version: str,
        code: str,
        description: str,
        backtest_result: Optional[Dict] = None
    ) -> str:
        """Register a new strategy version."""
        content = f"""# {strategy_name} v{version}

## 描述
{description}

## 代码
```{code}
```

## 回测结果
{json.dumps(backtest_result, indent=2) if backtest_result else "无回测结果"}
"""
        metadata = {
            "type": "strategy",
            "name": strategy_name,
            "version": version,
            "description": description,
            "backtest_available": backtest_result is not None
        }

        return self.kb.add_strategy(code, strategy_name, metadata)

    def get_strategy_history(self, strategy_name: str) -> List[Dict]:
        """Get version history for a strategy."""
        results = self.kb.search(strategy_name, top_k=20)
        filtered = [r for r in results if r['metadata'].get('type') == 'strategy']

        history = []
        for r in filtered:
            history.append({
                "version": r['metadata'].get('version'),
                "description": r['metadata'].get('description'),
                "id": r['id'],
                "relevance": 1.0 - r.get('distance', 0)
            })

        return sorted(history, key=lambda x: x['version'], reverse=True)

    def compare_versions(self, strategy_name: str, version1: str, version2: str) -> Dict:
        """Compare two strategy versions."""
        items = self.kb.list_items('strategy')

        v1_content = None
        v2_content = None

        for item in items:
            if item.metadata.get('name') == strategy_name:
                if item.metadata.get('version') == version1:
                    v1_content = item.content
                elif item.metadata.get('version') == version2:
                    v2_content = item.content

        return {
            "strategy": strategy_name,
            "version1": version1,
            "version2": version2,
            "content1": v1_content,
            "content2": v2_content,
            "comparable": v1_content is not None and v2_content is not None
        }


def demo_knowledge_base():
    """Demonstrate the knowledge base functionality."""
    kb = QuantKnowledgeBase()

    # Add sample strategies
    kb.add_strategy(
        code="""def momentum_strategy(prices):
    return prices.pct_change(20).rank()""",
        name="Momentum 20D",
        metadata={"author": "demo", "risk_level": "medium"}
    )

    kb.add_strategy(
        code="""def value_strategy(fundamentals):
    return (fundamentals['pe'] < 15) & (fundamentals['roe'] > 0.15)""",
        name="Value Factor",
        metadata={"author": "demo", "risk_level": "low"}
    )

    # Add factor definitions
    kb.add_factor(
        definition="ROE = Net Income / Shareholders Equity",
        name="ROE",
        metadata={"category": "profitability"}
    )

    kb.add_factor(
        definition="Market Cap = Price * Shares Outstanding",
        name="MarketCap",
        metadata={"category": "size"}
    )

    # Add backtest report
    kb.add_backtest_report(
        report_text="Strategy: Momentum 20D\nSharpe: 1.2\nMaxDrawdown: 15%\nPeriod: 2020-2025",
        strategy_name="Momentum 20D",
        metadata={"sharpe": 1.2}
    )

    # Search examples
    print("=== Search: 'momentum strategy' ===")
    results = kb.search("momentum strategy", top_k=2)
    for r in results:
        print(f"- {r['metadata'].get('type')}: {r['content'][:100]}...")

    print("\n=== Search: 'ROE factor' ===")
    results = kb.search("ROE factor", top_k=2)
    for r in results:
        print(f"- {r['metadata'].get('type')}: {r['content'][:100]}...")

    # Q&A example
    print("\n=== Q&A: 'What is the momentum strategy?' ===")
    qa = KnowledgeBaseQA(kb)
    answer = qa.ask("What is the momentum strategy?")
    print(f"Q: {answer['question']}")
    print(f"A: {answer['answer'][:200]}...")


if __name__ == "__main__":
    demo_knowledge_base()
