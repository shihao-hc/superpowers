import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const rps = new Trend('requests_per_second');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
    },
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: 50, duration: '1m' },
        { target: 100, duration: '2m' },
        { target: 200, duration: '2m' },
        { target: 300, duration: '5m' },
        { target: 0, duration: '1m' },
      ],
    },
    spike: {
      executor: 'spike',
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 200 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.02'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const endpoints = [
    () => testPersonality(),
    () => testChat(),
    () => testIntent(),
    () => testSolutions(),
    () => testWorkflows(),
  ];

  const test = endpoints[Math.floor(Math.random() * endpoints.length)];
  test();

  sleep(Math.random() * 1 + 0.5);
}

function testPersonality() {
  const res = http.get(`${BASE_URL}/api/personality`);
  rps.add(1);
  check(res, { 'personality loaded': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function testChat() {
  const res = http.post(
    `${BASE_URL}/api/chat`,
    JSON.stringify({ text: 'Performance test message' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  rps.add(1);
  check(res, { 'chat responded': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function testIntent() {
  const res = http.post(
    `${BASE_URL}/api/v1/intent/understand`,
    JSON.stringify({ message: 'Analyze data' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  rps.add(1);
  check(res, { 'intent processed': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function testSolutions() {
  const res = http.get(`${BASE_URL}/api/solutions`);
  rps.add(1);
  check(res, { 'solutions loaded': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}

function testWorkflows() {
  const res = http.get(`${BASE_URL}/api/workflows`);
  rps.add(1);
  check(res, { 'workflows loaded': (r) => r.status === 200 });
  errorRate.add(res.status !== 200);
}
