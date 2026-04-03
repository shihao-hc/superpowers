# Cloud Deployment Guide for ShiHao Finance

## Overview

This guide covers deploying ShiHao Finance (backend + frontend) to cloud platforms using Docker. Two deployment approaches are provided:

- **Approach 1**: Single VM with Docker Compose (simplest, recommended for quick start)
- **Approach 2**: Kubernetes (recommended for production with scaling)

---

## Prerequisites

- Docker 20.10+ installed on target environment
- Docker Compose v2 (if using Approach 1)
- For Kubernetes: `kubectl`, `helm` (optional)
- Cloud provider CLI tools (optional but recommended):
  - AWS: AWS CLI, `eksctl`
  - GCP: `gcloud`, `kubectl`
  - Azure: Azure CLI, `kubectl`

---

## Approach 1: Single VM with Docker Compose

### Steps

1. **Prepare VM**

   ```bash
   # Create VM (e.g., Ubuntu 20.04 LTS)
   # SSH into VM and install Docker
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   logout  # re-login to apply group changes
   ```

2. **Deploy Code**

   ```bash
   # Clone or upload the project to VM
   cd ~/shihao-web

   # Pull latest images (or build locally)
   docker-compose pull

   # Start services
   docker-compose up -d

   # Check status
   docker-compose ps
   ```

3. **Configure Firewall**

   ```bash
   # Open ports 4000 (backend) and 80 (frontend)
   sudo ufw allow 4000/tcp
   sudo ufw allow 80/tcp
   sudo ufw enable
   ```

4. **Access Application**

   - Frontend: `http://<VM_IP>:80`
   - Backend API: `http://<VM_IP>:4000`

### Optional: Enable HTTPS with Nginx

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate (replace domain)
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Approach 2: Kubernetes Deployment

### Option A: AWS EKS

1. **Create EKS Cluster**

   ```bash
   # Install eksctl
   curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
   sudo mv /tmp/eksctl /usr/local/bin

   # Create cluster
   eksctl create cluster \
     --name shihao-cluster \
     --region us-east-1 \
     --nodegroup-name shihao-nodes \
     --node-type t3.medium \
     --nodes 2
   ```

2. **Deploy YAML**

   ```bash
   kubectl apply -f k8s/backend-deployment.yaml
   kubectl apply -f k8s/frontend-deployment.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

3. **Verify**

   ```bash
   kubectl get pods
   kubectl get services
   ```

### Option B: GCP GKE

1. **Create GKE Cluster**

   ```bash
   gcloud container clusters create shihao-cluster \
     --num-nodes=2 \
     --region=us-central1

   gcloud container clusters get-credentials shihao-cluster
   ```

2. **Deploy**

   ```bash
   kubectl apply -f k8s/
   ```

### Option C: Azure AKS

1. **Create AKS**

   ```bash
   az group create --name shihao-rg --location eastus
   az aks create \
     --resource-group shihao-rg \
     --name shihao-cluster \
     --node-count 2 \
     --enable-managed-identity

   az aks get-credentials --resource-group shihao-rg --name shihao-cluster
   ```

2. **Deploy**

   ```bash
   kubectl apply -f k8s/
   ```

---

## Kubernetes YAML Examples

### k8s/backend-deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shihao-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shihao-backend
  template:
    metadata:
      labels:
        app: shihao-backend
    spec:
      containers:
      - name: backend
        image: your-registry/shihao-backend:latest
        ports:
        - containerPort: 4000
        env:
        - name: PORT
          value: "4000"
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
---
apiVersion: v1
kind: Service
metadata:
  name: shihao-backend-svc
spec:
  selector:
    app: shihao-backend
  ports:
  - port: 80
    targetPort: 4000
  type: ClusterIP
```

### k8s/frontend-deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shihao-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shihao-frontend
  template:
    metadata:
      labels:
        app: shihao-frontend
    spec:
      containers:
      - name: frontend
        image: nginx:stable-alpine
        ports:
        - containerPort: 80
        volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
        volumes:
        - name: html
          configMap:
            name: shihao-frontend-html
---
apiVersion: v1
kind: Service
metadata:
  name: shihao-frontend-svc
spec:
  selector:
    app: shihao-frontend
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

### k8s/ingress.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shihao-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: shihao-frontend-svc
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: shihao-backend-svc
            port:
              number: 80
      - path: /health
        pathType: Exact
        backend:
          service:
            name: shihao-backend-svc
            port:
              number: 80
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Backend listen port | 4000 |
| NODE_ENV | Environment | production |
| CN_SERVICE_URL | CN stock data service URL | (optional) |
| USE_MOCK_AGGREGATE | Use mock data for tests | false |

---

## Monitoring & Health Checks

- Backend health: `GET /health`, `GET /health/canary`
- Kubernetes liveness/readiness probes:
  ```yaml
  livenessProbe:
    httpGet:
      path: /health
      port: 4000
    initialDelaySeconds: 10
    periodSeconds: 30
  ```

---

## Security Recommendations

1. **Network Policies**: Restrict pod-to-pod communication
2. **Secrets**: Use Kubernetes Secrets or cloud provider secret managers
3. **TLS**: Enable HTTPS via Ingress with TLS termination
4. **RBAC**: Configure appropriate RBAC roles for cluster access

---

## CI/CD Integration Example (GitHub Actions)

```yaml
name: Deploy to Cloud

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          docker build -t shihao-backend:${{ github.sha }} ./backend
          docker push your-registry/shihao-backend:${{ github.sha }}

      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/shihao-backend backend=your-registry/shihao-backend:${{ github.sha }}
```

---

## Rollback Procedure

```bash
# Kubernetes
kubectl rollout undo deployment/shihao-backend

# Docker Compose
docker-compose pull previous-version-tag
docker-compose up -d
```

---

## Support

For issues or questions, please open an issue in the repository.
