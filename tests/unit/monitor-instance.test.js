const { decideMonitorAction, STALE_MS } = require('../../scripts/monitor-instance');

describe('monitor-instance.decideMonitorAction', () => {
  it('无进程 + 心跳缺失 → spawn', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: null, monitorPids: [] });
    expect(d).toMatchObject({ action: 'spawn', spawn: true, killPids: [] });
  });

  it('无进程 + 心跳过期 → spawn', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: STALE_MS + 1000, monitorPids: [] });
    expect(d.action).toBe('spawn');
    expect(d.spawn).toBe(true);
  });

  it('无进程 + 心跳新鲜 → 保守 ok（不启）', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: 1000, monitorPids: [] });
    expect(d).toMatchObject({ action: 'ok', spawn: false, killPids: [] });
  });

  it('1 进程 + 心跳新鲜 → ok，不杀不启', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: 5000, monitorPids: [123] });
    expect(d).toMatchObject({ action: 'ok', spawn: false, killPids: [] });
  });

  it('1 进程 + 心跳过期（僵留）→ replace：杀掉重建', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: STALE_MS + 1, monitorPids: [123] });
    expect(d).toMatchObject({ action: 'replace', spawn: true });
    expect(d.killPids).toEqual([123]);
  });

  it('多进程 + 心跳新鲜（重复）→ dedupe：保留首个、杀多余', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: 3000, monitorPids: [11, 22, 33] });
    expect(d).toMatchObject({ action: 'dedupe', spawn: false });
    expect(d.killPids).toEqual([22, 33]);
  });

  it('多进程 + 心跳过期 → replace：全部杀掉重建', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: STALE_MS + 10, monitorPids: [11, 22] });
    expect(d).toMatchObject({ action: 'replace', spawn: true });
    expect(d.killPids).toEqual([11, 22]);
  });

  it('进程枚举失败（非数组）→ unknown：不杀不启（不用不可信数据动作）', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: 1000, monitorPids: { error: 'powershell timeout' } });
    expect(d).toMatchObject({ action: 'unknown', spawn: false, killPids: [] });
  });

  it('heartbeatAgeMs 为 undefined/null/NaN → 视为过期', () => {
    expect(decideMonitorAction({ heartbeatAgeMs: undefined, monitorPids: [] }).action).toBe('spawn');
    expect(decideMonitorAction({ heartbeatAgeMs: NaN, monitorPids: [] }).action).toBe('spawn');
  });

  it('心跳年龄恰等于阈值 → 判为过期（边界 >=）', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: STALE_MS, monitorPids: [7] });
    expect(d.action).toBe('replace');
  });

  it('阈值常量 = 120000ms（2 分钟，与旧 keepalive 一致）', () => {
    expect(STALE_MS).toBe(120000);
  });

  it('无参调用不抛错', () => {
    expect(() => decideMonitorAction()).not.toThrow();
  });
});
