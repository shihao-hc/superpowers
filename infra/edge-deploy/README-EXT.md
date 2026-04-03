Edge Deployment: 进阶说明（Part 10 扩展）
- 内容摘要：边缘节点就近部署、跨区域路由、就近推理入口、灾备策略与监控
- 本地演练步骤：使用 deploy-all.sh 或 Kubernetes edge 部署模板进行演练
- 运行与验证：
  1) 部署后访问 edge 服务端点，验证就近入口
  2) 验证 /health/ /api/infer 的可用性与延迟
- 监控：确保 Prometheus/Grafana 能抓取 edge 节点的健康与指标
