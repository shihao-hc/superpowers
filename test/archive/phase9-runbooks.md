Phase 9 Runbooks
- 运行日常
  1) 查看健康端点
     - curl http://localhost/health
  2) 推理端点可用性
     - curl -X POST -H 'Content-Type: application/json' -d '{"text":"health"}' http://localhost/api/infer
- 灰度与容错
  1) 将新版本在一个小比例的流量上开启，观察指标
  2) 若出现异常，快速回滚到前一个稳定版本
- 事故响应
  1) 收集日志、指标、告警信息
  2) 尝试重启服务或回滚镜像
- 数据备份与恢复
  1) 触发数据备份
 2) 验证恢复流程
