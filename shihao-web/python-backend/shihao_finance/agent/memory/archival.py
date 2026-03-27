import sqlite3
import json
from datetime import datetime
from typing import Optional
from pathlib import Path
import uuid


class ArchivalMemory:
    """
    档案记忆 - 冷存储
    
    类似于操作系统磁盘，存储大量历史数据。
    使用SQLite实现，支持全文搜索。
    """
    
    def __init__(self, db_path: str = None):
        self.db_path = db_path or "./data/archival_memory.db"
        self.conn = None
    
    async def initialize(self):
        """初始化数据库"""
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                doc_type TEXT,
                tags TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        self.conn.commit()
    
    async def add(self, title: str, content: str, 
                  doc_type: str = "general",
                  tags: list[str] = None,
                  metadata: dict = None) -> str:
        """添加文档"""
        doc_id = str(uuid.uuid4())
        
        self.conn.execute(
            """INSERT INTO documents (id, title, content, doc_type, tags, metadata)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (doc_id, title, content, doc_type, 
             json.dumps(tags or []), json.dumps(metadata or {}))
        )
        self.conn.commit()
        
        return doc_id
    
    async def search(self, query: str, limit: int = 10,
                     doc_type: str = None) -> list[dict]:
        """全文搜索"""
        sql = "SELECT * FROM documents WHERE (title LIKE ? OR content LIKE ?) AND 1=1"
        params = [f"%{query}%", f"%{query}%"]
        
        if doc_type:
            sql += " AND doc_type = ?"
            params.append(doc_type)
        
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        cursor = self.conn.execute(sql, params)
        rows = cursor.fetchall()
        
        return [self._row_to_dict(row) for row in rows]
    
    async def get_by_id(self, doc_id: str) -> Optional[dict]:
        """按ID获取文档"""
        cursor = self.conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        )
        row = cursor.fetchone()
        
        return self._row_to_dict(row) if row else None
    
    async def update(self, doc_id: str, **kwargs) -> bool:
        """更新文档"""
        updates = []
        params = []
        
        for key, value in kwargs.items():
            if key in ["title", "content", "doc_type"]:
                updates.append(f"{key} = ?")
                params.append(value)
            elif key == "tags":
                updates.append("tags = ?")
                params.append(json.dumps(value))
        
        if not updates:
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(doc_id)
        
        sql = f"UPDATE documents SET {', '.join(updates)} WHERE id = ?"
        self.conn.execute(sql, params)
        self.conn.commit()
        
        return True
    
    async def delete(self, doc_id: str) -> bool:
        """删除文档"""
        self.conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        self.conn.commit()
        return True
    
    async def list_by_type(self, doc_type: str, limit: int = 100) -> list[dict]:
        """按类型列出文档"""
        cursor = self.conn.execute(
            "SELECT * FROM documents WHERE doc_type = ? ORDER BY created_at DESC LIMIT ?",
            (doc_type, limit)
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]
    
    async def cleanup(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()
    
    def _row_to_dict(self, row) -> dict:
        """将行转换为字典"""
        return {
            "id": row["id"],
            "title": row["title"],
            "content": row["content"],
            "doc_type": row["doc_type"],
            "tags": json.loads(row["tags"]) if row["tags"] else [],
            "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }