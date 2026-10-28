import { upstreamAccess } from './src/auth';
import { startServer } from './src/server';

const app = startServer({
  port: Number(process.env.PORT ?? 3001),
  origins: (process.env.APP_ORIGINS ?? 'http://127.0.0.1:8080,http://localhost:8080').split(','),
  access: upstreamAccess(
    process.env.AUTH_SERVICE_URL ?? 'http://localhost:8000',
    process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:8082',
  ),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.stop();
  });
