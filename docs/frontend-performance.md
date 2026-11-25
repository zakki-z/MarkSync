# Frontend performance rules

The frontend is Next.js (App Router, Turbopack) with React 19. These are the rules the performance
work in `perf/ui-performance` established, and why. Numbers are in
[`docs/perf/ui-performance-baseline.md`](perf/ui-performance-baseline.md).

## Live data never goes through page-level React state

Presence, cursors, selections and the document text change many times per second. If they live in
`useState` of a component near the top of a page, every change re-renders everything below it:
the inputs, the toolbar, the presence panel, the editor wrapper.

Rule: **fast-changing state lives outside React and is read by the smallest component that shows
it.**

- **Document text.** `DocumentCollaboration` keeps the text in the Yjs document. Components read it
  with `useDocumentText`, a `useSyncExternalStore` over `getText` / `subscribeText`. Only
  `CharacterCount` and `LivePreview` (in `LiveMarkdown.tsx`) subscribe; `DocumentEditor` does not.
  The snapshot (`getSnapshot`) holds only state that changes rarely: connection status, whether
  the server's state arrived, and what the server allows. Do not add per-keystroke fields to it.
- **Remote cursors and selections.** They belong to CodeMirror: `y-codemirror.next` reads the Yjs
  awareness and draws them as editor decorations. They must never be copied into React state.
- **Workspace presence.** The shell owns one connection per open workspace, behind a
  `PresenceHub` (`src/presence/PresenceHub.ts`): a stable store whose context value never
  changes. The top-bar leaves (`LiveStatus`, `PresenceAvatars`, `ChatButton`, the online count in
  the workspace subtitle) each read one slice (status, users or messages) with
  `useSyncExternalStore`, so a user joining or a message arriving re-renders those leaves only.
  Never copy presence into page state or into a context value that changes.
- **Cursor position.** The editor writes line and column to a small store
  (`createCursorStore` in `src/components/document/editorState.ts`); only the status bar reads it.
- **Anything new that updates faster than a few times per second** follows the same shape: an
  object with `getSnapshot` and `subscribe`, read through `useSyncExternalStore` in a leaf.

Callbacks passed to memoised children (`onSessionExpired`, row handlers) must be stable
(`useCallback`, or a `useMemo`-ed object such as `usePrefetch`), otherwise `memo` does nothing.

## Server state goes through TanStack Query

- Reads use `useServerQuery` (`src/hooks/useServerQuery.ts`) with keys and stale times from
  `src/queries/keys.ts`. It keeps the `{ data, error, loading, setData }` shape of the old
  `useRemoteData`, so pages did not change.
- Writes that change a cached list live in `src/queries/mutations.ts`. Updates and deletes change
  the cache first and roll back on failure; creates cannot, because the id comes from the server.
  Every write ends by revalidating the list. New writes that affect cached data must either
  update it there or invalidate the key.
- The cache is cleared on sign-out and on sign-in (`useEndSession`, the auth page). Anything that
  ends a session must do the same, or the next user could see the previous user's data.
- Failed requests are not retried and refetch-on-focus is off. A 401 has to reach `useEndSession`
  at once, and the page must not change under the user when the tab regains focus.
- Hover and focus on document and workspace links call `usePrefetch`, which fills the cache and
  loads the route and the editor chunk before the click.

## Code splitting

Next.js already splits JavaScript per route. The extra split is the editor: `DocumentEditor`
loads `CollaborativeEditor` (CodeMirror and its language packs, roughly 530 kB raw) with
`next/dynamic`, so it is not part of the document route's first load. The shell's overlays (the
command palette with `cmdk`, the invite dialog with its Select, the new workspace dialog and the
mobile navigation drawer) load the same way, the first time they open, and then stay mounted.
Keep other large, optional libraries behind the same pattern, and give the placeholder the final
element's box so nothing moves when it loads.

## Loading states

Signed-in pages render their real top bar at once and show skeletons from `PageStates.tsx` in the
content area while their data loads: `ShellSkeleton` before the session is known, then
`HeaderSkeleton`, `ContentSkeleton` (`documents` or `list`) and `DocumentSkeleton`, whose bars have
the heights of the elements that replace them (60 px rows, 92 px quick-action cards, the 40 px
title). The goal is no layout shift when data arrives. Where the real layout depends on data that
is not known yet, reserve its room instead of letting it pop in, as the sidebar does with
`WorkspaceListPlaceholder`. If a row, card or header changes size, update the skeleton with it;
check for shifts at 390 px and 1440 px wide with a `layout-shift` PerformanceObserver. Do not hold a page back to avoid a shift: a slow secondary
request (membership, presence) must never keep a document from appearing.

## How to measure

```bash
cd frontend
bun run build            # run it twice if the first run stops on the Next.js advisory notice
bunx next analyze --output --snapshot <name>
bunx next analyze export --snapshot <name> > bundle-graph.jsonl
```

Per-route first-load JavaScript is in `.next/diagnostics/route-bundle-stats.json`. For Lighthouse,
run `next start` against a stub backend and use the mobile preset with three runs per route.
Re-render counts: temporarily add a counter to the component under test, build for production and
drive it with Playwright; do not commit the counters.
