import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const chatLatency = new Trend('chat_latency');
const skillLatency = new Trend('skill_latency');
const workflowLatency = new Trend('workflow_latency');
const apiLatency = new Trend('api_latency');

const chatErrors = new Counter('chat_errors');
const skillErrors = new Counter('skill_errors');
const workflowErrors = new Counter('workflow_errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
    chat_latency: ['p(95)<800'],
    skill_latency: ['p(95)<500'],
    workflow_latency: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
  };
}

export default function () {
  const scenarios = [
    () => testChatAPI(),
    () => testIntentUnderstanding(),
    () => testSkillChain(),
    () => testWorkspaceAPI(),
    () => testSolutionsAPI(),
  ];

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(Math.random() * 2 + 0.5);
}

function testChatAPI() {
  group('Chat API', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/chat`,
      JSON.stringify({ text: `Hello at ${new Date().toISOString()}` }),
      { headers: headers(), tags: { name: 'chat' } }
    );
    chatLatency.add(Date.now() - start);

    const success = check(res, {
      'chat status 200': (r) => r.status === 200,
      'chat has response': (r) => r.json('text') !== undefined || r.json('message') !== undefined,
    });

    if (!success) chatErrors.add(1);
    errorRate.add(!success);
  });
}

function testIntentUnderstanding() {
  group('Intent Understanding API', () => {
    const messages = [
      'Generate a weekly report',
      'Analyze sales data for this month',
      'Predict inventory for next week',
      'Optimize our workflow',
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/v1/intent/understand`,
      JSON.stringify({ message }),
      { headers: headers(), tags: { name: 'intent' } }
    );
    skillLatency.add(Date.now() - start);

    const success = check(res, {
      'intent status 200': (r) => r.status === 200,
      'intent has result': (r) => r.json('intent') !== undefined || r.json('skills') !== undefined,
    });

    if (!success) skillErrors.add(1);
    errorRate.add(!success);
  });
}

function testSkillChain() {
  group('Skill Chain Execution', () => {
    const chains = [
      {
        name: 'Data Pipeline',
        steps: [
          { skill: 'collector', action: 'collect' },
          { skill: 'analyzer', action: 'analyze', dependsOn: ['step_0'] },
        ],
      },
      {
        name: 'Report Generation',
        steps: [
          { skill: 'data-collector', action: 'collect' },
          { skill: 'analyzer', action: 'analyze' },
          { skill: 'reporter', action: 'generate', dependsOn: ['step_1'] },
        ],
      },
    ];
    const chain = chains[Math.floor(Math.random() * chains.length)];

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/v1/intent/execute-chain`,
      JSON.stringify({ chain, input: { vu: __VU, iteration: __ITER } }),
      { headers: headers(), tags: { name: 'workflow' } }
    );
    workflowLatency.add(Date.now() - start);

    const success = check(res, {
      'workflow status 200': (r) => r.status === 200,
      'workflow has id': (r) => r.json('id') !== undefined,
    });

    if (!success) workflowErrors.add(1);
    errorRate.add(!success);
  });
}

function testWorkspaceAPI() {
  group('Workspace API', () => {
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/v1/workspaces`,
      {
        headers: { ...headers(), 'x-tenant-id': `tenant-${__VU}` },
        tags: { name: 'workspace' },
      }
    );
    apiLatency.add(Date.now() - start);

    check(res, {
      'workspace status 200': (r) => r.status === 200,
    });
  });
}

function testSolutionsAPI() {
  group('Solutions API', () => {
    const endpoints = [
      `${BASE_URL}/api/solutions`,
      `${BASE_URL}/api/workflows`,
      `${BASE_URL}/api/personality`,
    ];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const start = Date.now();
    const res = http.get(endpoint, { tags: { name: 'solutions' } });
    apiLatency.add(Date.now() - start);

    check(res, {
      'solutions status 200': (r) => r.status === 200,
    });
  });
}
