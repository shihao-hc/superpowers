# Phase 10 Edge Deployment Checklist

## Pre-Deployment
- [ ] Review edge deployment templates
- [ ] Verify Kubernetes cluster access
- [ ] Check environment variables (EDGE_HOST, EDGE_PORT)
- [ ] Validate Prometheus/Grafana configuration

## Deployment
- [ ] Apply Kubernetes manifests
  - `kubectl apply -f infra/k8s/edge-deployment.yaml`
  - `kubectl apply -f infra/k8s/edge-service.yaml`
- [ ] Verify pods are running
  - `kubectl get pods -l app=ai-platform-edge`
- [ ] Check service endpoints
  - `kubectl get svc ai-platform-edge`

## Validation
- [ ] Run health checks
  - `bash infra/edge-deploy/edge-final-check.sh`
- [ ] Test inference endpoint
  - `curl -X POST http://<edge-host>/api/infer -d '{"text":"test"}'`
- [ ] Verify Prometheus metrics
- [ ] Check Grafana dashboards

## Monitoring
- [ ] Verify Prometheus scraping
- [ ] Check Grafana data sources
- [ ] Review alerting rules

## Rollback (if needed)
- [ ] `kubectl rollout undo deployment/ai-platform-edge`
- [ ] Verify rollback succeeded
