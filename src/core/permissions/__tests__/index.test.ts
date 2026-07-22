/**
 * Permissions Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionService } from '../index.js';
import { PermissionContextManager } from '../context.js';
import { RuleEngine } from '../rules.js';
import { PermissionModeManager } from '../modes.js';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
  });

  it('should register permissions', () => {
    service.registerPermission({
      id: 'test.read',
      name: 'Test Read',
      description: 'Read test data',
      category: 'data'
    });

    expect(service.getPermission('test.read')).toBeDefined();
  });

  it('should grant permissions', () => {
    service.registerPermission({
      id: 'grant.test',
      name: 'Grant Test'
    });

    service.grant('user-1', 'grant.test');
    expect(service.hasPermission('user-1', 'grant.test')).toBe(true);
  });

  it('should revoke permissions', () => {
    service.registerPermission({
      id: 'revoke.test',
      name: 'Revoke Test'
    });

    service.grant('user-1', 'revoke.test');
    service.revoke('user-1', 'revoke.test');
    expect(service.hasPermission('user-1', 'revoke.test')).toBe(false);
  });
});

describe('PermissionContextManager', () => {
  let manager: PermissionContextManager;

  beforeEach(() => {
    manager = new PermissionContextManager();
  });

  it('should create context', () => {
    const context = manager.create('session-1', 'default');
    expect(context).toBeDefined();
    expect(context.mode).toBe('default');
  });

  it('should set mode', () => {
    manager.create('session-2', 'default');
    manager.setMode('session-2', 'bypassPermissions');
    
    const context = manager.get('session-2');
    expect(context?.mode).toBe('bypassPermissions');
  });

  it('should record decisions', () => {
    manager.create('session-3', 'default');
    manager.recordDecision('session-3', {
      tool: 'test',
      input: {},
      decision: 'allow',
      timestamp: Date.now()
    });

    const history = manager.getHistory('session-3');
    expect(history.length).toBe(1);
  });
});

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  it('should add and get rules', () => {
    engine.addRule({
      id: 'test-rule',
      name: 'Test Rule',
      priority: 100,
      condition: { toolName: 'Read' },
      action: 'allow'
    });

    const rule = engine.getRule('test-rule');
    expect(rule).toBeDefined();
    expect(rule?.name).toBe('Test Rule');
  });

  it('should match rules', () => {
    engine.addRule({
      id: 'match-test',
      name: 'Match Test',
      priority: 100,
      condition: { toolName: 'Write' },
      action: 'deny'
    });

    const result = engine.match('match-test', { toolName: 'Write' });
    expect(result.matched).toBe(true);
  });

  it('should find matching rules', () => {
    engine.addRule({
      id: 'allow-read',
      name: 'Allow Read',
      priority: 100,
      condition: { toolName: 'Read' },
      action: 'allow'
    });

    const rule = engine.findMatchingRule({ toolName: 'Read' }, 'allow');
    expect(rule?.id).toBe('allow-read');
  });
});

describe('PermissionModeManager', () => {
  let manager: PermissionModeManager;

  beforeEach(() => {
    manager = new PermissionModeManager();
  });

  it('should set and get mode', () => {
    manager.setMode('bypassPermissions');
    expect(manager.getMode()).toBe('bypassPermissions');
  });

  it('should restore previous mode', () => {
    manager.setMode('plan');
    manager.setMode('bypassPermissions');
    const previous = manager.restorePreviousMode();
    expect(previous).toBe('plan');
  });

  it('should decide based on mode', () => {
    manager.setMode('bypassPermissions');
    const decision = manager.decide({
      mode: 'bypassPermissions',
      alwaysAllowRules: [],
      alwaysDenyRules: [],
      deniedRules: [],
      sessionAllowRules: [],
      autoAllowedPaths: [],
      sessionHistory: []
    });
    expect(decision.decision).toBe('allow');
  });
});
