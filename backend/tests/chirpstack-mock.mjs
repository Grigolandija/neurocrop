import http from 'node:http';

const devices = new Set();
const keys = new Set();
const port = Number(process.env.CHIRPSTACK_MOCK_PORT || 8099);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;
  const match = path.match(/^\/api\/devices\/([0-9a-f]{16})(\/keys)?$/i);

  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && path === '/api/devices') {
    devices.add(String(body?.device?.devEui || '').toLowerCase());
    return res.end('{}');
  }
  if (match && req.method === 'GET' && !match[2]) {
    const exists = devices.has(match[1].toLowerCase());
    if (!exists) res.statusCode = 404;
    return res.end(exists ? JSON.stringify({ device: { devEui: match[1] } }) : '{}');
  }
  if (match && req.method === 'GET' && match[2]) {
    const exists = keys.has(match[1].toLowerCase());
    if (!exists) res.statusCode = 404;
    return res.end(exists ? JSON.stringify({ deviceKeys: { devEui: match[1] } }) : '{}');
  }
  if (match && req.method === 'POST' && match[2]) {
    keys.add(match[1].toLowerCase());
    return res.end('{}');
  }
  if (match && req.method === 'DELETE' && !match[2]) {
    devices.delete(match[1].toLowerCase());
    keys.delete(match[1].toLowerCase());
    return res.end('{}');
  }

  res.statusCode = 404;
  res.end('{}');
}).listen(port, '127.0.0.1', () => console.log(`ChirpStack mock listening on ${port}`));
