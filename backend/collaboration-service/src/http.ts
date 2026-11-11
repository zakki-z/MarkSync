/** The part of `fetch` the upstream clients use, so tests can substitute it. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
