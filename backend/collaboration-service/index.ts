import { MongoClient } from 'mongodb';
import { createApp } from './src/app';
import { AuthServiceAuthenticator } from './src/connection-authenticator';
import { HttpDocumentAccessChecker } from './src/document-access';
import { MongoDocumentPersistence } from './src/persistence/mongo-document-persistence';
import { HEARTBEAT_INTERVAL_MS } from './src/protocol';
import { startServer } from './src/server';
import { HttpWorkspaceAccessChecker } from './src/workspace-access';

const number = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

const timeoutMs = number('UPSTREAM_TIMEOUT_MS', 5000);
const mongo = await MongoClient.connect(process.env.MONGODB_URL ?? 'mongodb://localhost:27017');
const app = createApp({
  access: new HttpWorkspaceAccessChecker(
    process.env.WORKSPACE_SERVICE_URL ?? 'http://localhost:8083',
    timeoutMs,
  ),
  documentAccess: new HttpDocumentAccessChecker(
    process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:8082',
    timeoutMs,
  ),
  persistence: await MongoDocumentPersistence.create(
    mongo.db(process.env.MONGODB_DATABASE ?? 'marksync_collaboration'),
  ),
  heartbeat: {
    intervalMs: number('HEARTBEAT_INTERVAL_MS', HEARTBEAT_INTERVAL_MS),
    maxMissed: number('HEARTBEAT_MAX_MISSED', 3),
  },
  revalidateMs: number('REVALIDATE_INTERVAL_MS', 30_000),
});
const service = startServer({
  port: number('PORT', 3001),
  origins: (process.env.APP_ORIGINS ?? 'http://127.0.0.1:8080,http://localhost:8080').split(','),
  authenticator: new AuthServiceAuthenticator(
    process.env.AUTH_SERVICE_URL ?? 'http://localhost:8000',
    timeoutMs,
  ),
  app,
});
// Edits still buffered are stored before the database connection is closed.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void service.stop().finally(() => mongo.close()));
