import { createServer } from 'node:http';

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') return response.end('{}');
  if (request.url === '/auth/me' && request.headers.authorization === 'Bearer local-test-jwt') {
    return response.end(JSON.stringify({ id: 7, email: 'student@sussex.ac.uk', role: 'user' }));
  }
  response.statusCode = 401;
  response.end(JSON.stringify({ detail: 'Invalid session' }));
});
server.listen(8100, '127.0.0.1');
