Edge Monitors (Phase 10)
- 监控点：边缘节点健康、入口流量、延迟、错误率、缓存命中率
- 指标源：Prometheus 指标端点、边缘节点健康探针
- 呈现：Grafana 仪表盘、告警告警
- 运行：将 edge-monitors 收集到 Prometheus，Grafana 展示，告警触发时通知运维
