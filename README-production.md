Production Deployment Guide (Phase 4)
====================================
- Goal: Deploy the AI platform in production-ready mode with Docker Compose, externalized inference, health checks, and automated tests.
- Prerequisites: Docker, docker-compose, Git repo checked out.

1) Build and run in Docker
- Build the images: docker-compose -f docker/docker-compose.yml build
- Start services: docker-compose -f docker/docker-compose.yml up -d
- Access the frontend and API: http://localhost:3000/
- Health check: http://localhost:3000/health
- API inference: POST http://localhost:3000/api/infer with body {"text": "your text"}

2) Local production environment variables
- You can override via production.env.json or environment variables.
- Production endpoints can be wired by INFER_ENDPOINT in INFER Bridge (as Part 4 supports).

3) Run health and basic tests
- Health check via curl or browser
- Basic API test: curl -X POST -H "Content-Type: application/json" -d '{"text":"hello"}' http://localhost:3000/api/infer

4) Observability & logging
- Use docker logs <container> for production logs
- Add a logging middleware if you plan to push logs to a central system

Notes
- This patch set provides production-ready skeletons and a production deployment path; adjust for your security, TLS, and scaling needs.
- Production environment: Nginx reverse proxy (optional)
- Use Docker Compose to expose application on port 80 via Nginx: http://localhost/
- TLS termination recommended via a separate load balancer or reverse proxy in front of Nginx
