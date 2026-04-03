// Phase 3 API path test using fetch
(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello from test' })
    });
    const data = await res.json();
    console.log('Phase3-API-Test response:', data);
  } catch (e) {
    console.error('Phase3-API-Test error:', e.message);
  }
})();
