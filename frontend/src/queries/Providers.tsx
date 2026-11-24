'use client';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient } from './queryClient';

let browserClient: QueryClient | undefined;

/** One client for the whole browser session; every server render gets its own. */
function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return createQueryClient();
  return (browserClient ??= createQueryClient());
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
