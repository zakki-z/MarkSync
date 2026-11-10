import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

export function GET(request: Request) {
  return forwardToWorkspaces(request, '/api/workspaces');
}

export function POST(request: Request) {
  return forwardToWorkspaces(request, '/api/workspaces');
}
