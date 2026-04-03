// Phase 4 Production API path test (health + infer)
(async () => {
  try {
    const fetch = (typeof global.fetch === 'function') ? global.fetch : (await import('node-fetch')).default;
    const res = await fetch('http://localhost:3000/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'health check' })
    });
    const data = await res.json();
    console.log('Phase4-api-test response:', data);
  } catch (e) {
    console.error('Phase4-api-test error:', e.message);
  }
})();
