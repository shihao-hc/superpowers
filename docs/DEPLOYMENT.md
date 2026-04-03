# UltraWork AI v1.0.0 Production Deployment Guide

## Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- kubectl configured for your cluster
- SSL certificates (Let's Encrypt or commercial)
- Domain name configured

## Quick Start

```bash
# Add Helm repository
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install UltraWork
helm install ultrawork ./k8s/helm/ultrawork \
  --namespace ultrawork \
  --create-namespace \
  --values ./k8s/helm/ultrawork/values-prod.yaml
```

## Production Configuration

### values-prod.yaml

```yaml
replicaCount: 3

image:
  repository: ghcr.io/your-org/ultrawork
  tag: "1.0.0"

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: ultrawork.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ultrawork-tls
      hosts:
        - ultrawork.example.com

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 1000m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

security:
  apiKey: "${API_KEY}"
  allowedOrigins: "https://ultrawork.example.com"

redis:
  enabled: true
  architecture: replication
  auth:
    enabled: true
    password: "${REDIS_PASSWORD}"

monitoring:
  enabled: true
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true
  grafana:
    enabled: true
    adminPassword: "${GRAFANA_PASSWORD}"
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Production API key | Yes |
| `REDIS_PASSWORD` | Redis authentication | Yes |
| `GRAFANA_PASSWORD` | Grafana admin password | Yes |
| `NODE_ENV` | Environment (production) | Yes |
| `LOG_LEVEL` | Log level (info/warn/error) | No |
| `ALLOWED_ORIGINS` | CORS origins | Yes |

## SSL/TLS Setup

### Using Let's Encrypt

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

## Monitoring Setup

### Prometheus + Grafana

```bash
# Install Prometheus Operator
helm install prometheus bitnami/kube-prometheus \
  --namespace monitoring \
  --create-namespace

# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Default login: admin / prom-operator
```

### Alert Notifications

Configure Slack/PagerDuty in `monitoring/grafana/provisioning/notifiers/notifiers.yaml`

## Database Backup

### PostgreSQL (if using)

```bash
# Create backup cronjob
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ultrawork-backup
  namespace: ultrawork
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            command: ["pg_dump", "-h", "postgres", "-U", "postgres", "-d", "ultrawork"]
            env:
              - name: PGPASSWORD
                valueFrom:
                  secretKeyRef:
                    name: postgres-secret
                    key: password
          restartPolicy: OnFailure
EOF
```

## Health Checks

```bash
# Check pod status
kubectl get pods -n ultrawork

# Check logs
kubectl logs -n ultrawork -l app.kubernetes.io/name=ultrawork --tail=100

# Check resource usage
kubectl top pods -n ultrawork

# Check ingress
kubectl describe ingress -n ultrawork
```

## Scaling

### Manual
```bash
kubectl scale deployment ultrawork -n ultrawork --replicas=5
```

### Automatic (HPA)
```bash
kubectl get hpa -n ultrawork
kubectl autoscale deployment ultrawork -n ultrawork --min=3 --max=20 --cpu-percent=70
```

## Troubleshooting

### Pods not starting
```bash
kubectl describe pod <pod-name> -n ultrawork
kubectl logs <pod-name> -n ultrawork
```

### High latency
1. Check HPA status
2. Review Grafana dashboard
3. Check Redis connection
4. Review application logs

### SSL certificate issues
```bash
kubectl describe certificate -n ultrawork
kubectl describe certificaterequest -n ultrawork
```

## Rollback

```bash
# Rollback to previous version
helm rollback ultrawork -n ultrawork

# Rollback specific revision
helm rollback ultrawork 3 -n ultrawork
```

## Upgrade

```bash
# Update dependencies
helm repo update

# Upgrade
helm upgrade ultrawork ./k8s/helm/ultrawork \
  --namespace ultrawork \
  --values ./k8s/helm/ultrawork/values-prod.yaml

# Verify
kubectl rollout status deployment/ultrawork -n ultrawork
```

## Support

- Documentation: https://docs.ultrawork.ai
- Issues: https://github.com/your-org/ultrawork/issues
- Email: support@ultrawork.ai
