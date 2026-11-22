# Frontend styling

The frontend (`frontend/`, Next.js 16 with Turbopack) is styled with Tailwind CSS v4, a single
design-token layer and shadcn/ui primitives. This page explains how they fit together.

Tailwind is compiled by the official `@tailwindcss/turbopack` loader configured in
`next.config.ts`; there is no `tailwind.config` file. All theme configuration lives in CSS.

## Where styles live

| File                                  | Purpose                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/app/globals.css`            | The only CSS entry, imported by `app/layout.tsx`. Imports Tailwind, `tw-animate-css` and the tokens, then holds the legacy screen styles. |
| `frontend/src/styles/tokens.css`      | **All design tokens**, light and dark, and their mapping to Tailwind.                                                                     |
| `frontend/src/styles/fonts.ts`        | Self-hosted Geist Sans and Geist Mono via `next/font/local`.                                                                              |
| `frontend/src/styles/theme.ts`        | Theme helpers and the inline no-flash script.                                                                                             |
| `frontend/src/hooks/useTheme.ts`      | React hook for reading and changing the theme.                                                                                            |
| `frontend/src/components/primitives/` | shadcn/ui components (generated, then owned by us).                                                                                       |
| `frontend/src/lib/utils.ts`           | `cn()` to merge class names.                                                                                                              |

Legacy screens still use hand-written classes in `globals.css` with hard-coded light colours and
the old Arial / Courier New fonts. That is deliberate: they keep their current look until each
screen is migrated to token utilities. When migrating a screen, remove the pinned values it relied
on (`body` colours, `--legacy-font-*`, and the `--default-*-font-family` overrides) once nothing
else depends on them.

## The token file

`src/styles/tokens.css` has three parts:

1. `:root` holds the light values as plain CSS variables (`--background`, `--primary`,
   `--radius`, `--elevation-md`, `--motion-ease`, `--prose-width`...).
2. `.dark` overrides the values that change in dark mode.
3. `@theme inline` maps the variables to Tailwind namespaces, which creates the utilities.

| Group      | Variables                                                                                                                                                                              | Example utilities                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Colour     | `background`, `foreground`, `muted(-foreground)`, `border`, `input`, `ring`, `primary(-foreground)`, `destructive(-foreground)`, `popover`, `secondary`, `accent` (with `-foreground`) | `bg-background`, `text-muted-foreground`, `border-border`, `ring-ring/50` |
| Presence   | `presence-1` … `presence-8`                                                                                                                                                            | `bg-presence-3`, or `var(--presence-3)` in JS                             |
| Radius     | `--radius` (base), scale derived from it                                                                                                                                               | `rounded-sm` … `rounded-2xl`                                              |
| Shadow     | `--elevation-xs` … `--elevation-lg`                                                                                                                                                    | `shadow-xs` … `shadow-lg`                                                 |
| Motion     | `--duration-fast` (150ms), `--duration-normal` (200ms), `--motion-ease`                                                                                                                | `duration-(--duration-fast) ease-standard`                                |
| Typography | `--font-ui`, `--font-code`, `--prose-width` (70ch), `--prose-line-height` (1.7)                                                                                                        | `font-sans`, `font-mono`, `max-w-reading`, `leading-reading`              |

Spacing uses Tailwind's default scale; there are no spacing tokens.

The radius scale and `shadow-xs` / `shadow-sm` are set to Tailwind's default values, so utilities
already used by existing screens look exactly as before.

## Adding a token

1. Add the raw value to `:root` in `tokens.css`, and to `.dark` if it differs in dark mode.
2. If it should produce utilities, map it in `@theme inline` using the matching Tailwind
   namespace: `--color-*` for colours, `--radius-*`, `--shadow-*`, `--ease-*`, `--font-*`,
   `--container-*` (max-width), `--leading-*`, and so on.
3. Do not give the raw variable the same name as the theme variable (`--shadow-md:
var(--shadow-md)` is a cycle). Use a different raw name, as `--elevation-*` does.
4. Avoid names Tailwind already uses for built-in utilities (for example `--container-prose`
   would clash with `max-w-prose`).

Example, a "warning" colour:

```css
:root {
  --warning: #b45309;
}
.dark {
  --warning: #fbbf24;
}
@theme inline {
  --color-warning: var(--warning);
}
```

This gives `bg-warning`, `text-warning`, `border-warning/40`, and so on.

## Adding a shadcn/ui component

`frontend/components.json` is configured for Tailwind v4 (no config file), the `new-york` style,
lucide icons and these aliases:

- components go to `src/components/primitives` (because `src/components/ui.tsx` already exists),
- `cn` is imported from `@/src/lib/utils`.

From `frontend/`:

```bash
bunx --bun shadcn@latest add <component>
```

Then review the result before committing:

- The CLI may rewrite `cn` imports to a package called `cn`, or add it to `package.json`. Make
  sure imports use `@/src/lib/utils` and that no `cn` package was installed.
- Components that read the theme (such as `sonner`) are generated with `next-themes`. Use
  `useTheme` from `@/src/hooks/useTheme` instead and do not install `next-themes`.
- Leave `src/styles/tokens.css` and `app/globals.css` as they are; if the CLI adds variables, move
  any genuinely new token into `tokens.css` by hand.
- Run `bun run format` so the generated files follow the project's Prettier style.

Components that need a provider (`TooltipProvider`, `Toaster`) are not mounted yet; mount them in
the layout when the first screen uses them.

## Dark mode

- The theme is the `dark` class on `<html>`. Tailwind's `dark:` variant is bound to it in
  `tokens.css` (`@custom-variant dark`), and `.dark` swaps the token values.
- `themeInitScript` (in `src/styles/theme.ts`) runs inline in `<head>` before the first paint. It
  reads `localStorage["marksync-theme"]` (`light` or `dark`); without a stored value it follows
  `prefers-color-scheme` and keeps following system changes. This prevents a flash of the wrong
  theme. `<html>` has `suppressHydrationWarning` because the script changes its class before
  React hydrates.
- In components, use the hook:

  ```tsx
  const { preference, resolvedTheme, setPreference, toggle } = useTheme();
  setPreference("system"); // clears the stored choice
  ```

  Changes apply immediately, are persisted, and are picked up by other tabs.

- Outside React, `setThemePreference()` and `toggleTheme()` do the same.
- Legacy screens use hard-coded light colours, so they stay light in dark mode until migrated.
  `color-scheme` is not set yet for the same reason (it would darken native form controls on
  those screens); add `color-scheme: dark` to `.dark` once the main screens use tokens.
