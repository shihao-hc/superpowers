"""
ShiHao Finance Backend - Main Entry Point

Run the FastAPI server with:
    python run.py
"""

import uvicorn
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    """Run the API server."""
    print("=" * 60)
    print("ShiHao Finance API Server")
    print("AI-Powered Stock Selection and Trading System")
    print("=" * 60)
    print("\nStarting server...")
    print("API Docs: http://localhost:8000/docs")
    print("Health Check: http://localhost:8000/health")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(
        "shihao_finance.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()