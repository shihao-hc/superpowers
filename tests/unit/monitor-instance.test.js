const { decideMonitorAction, reconcileMonitors, STALE_MS } = require('../../scripts/monitor-instance');

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

  it('多进程 + 心跳新鲜（重复）→ replace：全部收敛重建（不"任保留一个"）', () => {
    const d = decideMonitorAction({ heartbeatAgeMs: 3000, monitorPids: [11, 22, 33] });
    expect(d).toMatchObject({ action: 'replace', spawn: true });
    expect(d.killPids).toEqual([11, 22, 33]);
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

describe('monitor-instance.reconcileMonitors（执行编排，IO 注入）', () => {
  function deps(over = {}) {
    const seq = [];
    const killPids = jest.fn((pids) => { seq.push('kill'); return pids.slice(); });
    const start = jest.fn(() => { seq.push('start'); });
    return {
      seq, killPids, start,
      listMonitorPids: jest.fn(() => []),
      heartbeatAgeMs: jest.fn(() => 1000),
      sleep: jest.fn(() => Promise.resolve()),
      log: jest.fn(),
      ...over
    };
  }

  it('replace：先杀后启（顺序正确）', async () => {
    const d = deps({ listMonitorPids: () => [1, 2], heartbeatAgeMs: () => 1000 });
    const r = await reconcileMonitors(d);
    expect(d.killPids).toHaveBeenCalledWith([1, 2]);
    expect(d.start).toHaveBeenCalledWith('scripts/monitor-server.js');
    expect(d.seq).toEqual(['kill', 'start']);
    expect(r.killed).toEqual([1, 2]);
    expect(r.spawned).toBe(true);
  });

  it('spawn：不杀只启', async () => {
    const d = deps({ listMonitorPids: () => [], heartbeatAgeMs: () => null });
    const r = await reconcileMonitors(d);
    expect(d.killPids).not.toHaveBeenCalled();
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ spawned: true, killed: [] });
  });

  it('ok：不杀不启', async () => {
    const d = deps({ listMonitorPids: () => [7], heartbeatAgeMs: () => 1000 });
    const r = await reconcileMonitors(d);
    expect(d.killPids).not.toHaveBeenCalled();
    expect(d.start).not.toHaveBeenCalled();
    expect(r).toMatchObject({ spawned: false, killed: [] });
  });

  it('unknown：枚举失败 → 不杀不启', async () => {
    const d = deps({ listMonitorPids: () => ({ error: 'x' }), heartbeatAgeMs: () => 1000 });
    const r = await reconcileMonitors(d);
    expect(d.killPids).not.toHaveBeenCalled();
    expect(d.start).not.toHaveBeenCalled();
    expect(r.spawned).toBe(false);
  });

  it('dry：只决策不动作', async () => {
    const d = deps({ listMonitorPids: () => [1, 2], heartbeatAgeMs: () => 1000, dry: true });
    const r = await reconcileMonitors(d);
    expect(d.killPids).not.toHaveBeenCalled();
    expect(d.start).not.toHaveBeenCalled();
    expect(r.decision.action).toBe('replace');
    expect(r).toMatchObject({ killed: [], spawned: false });
  });
});
