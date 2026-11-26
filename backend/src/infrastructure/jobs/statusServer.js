import http from 'node:http';

// PM2 considers a fork-mode process ready only after it opens a listening
// socket. Worker and scheduler have no public HTTP API, so they expose a
// loopback-only status endpoint purely for process-manager readiness probes.
export function createStatusServer(name) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: name }));
  });
  server.listen(0, '127.0.0.1');
  return server;
}

export async function closeStatusServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}
