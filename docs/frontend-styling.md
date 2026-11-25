# Frontend styling

The frontend (`frontend/`, Next.js 16 with Turbopack) is styled with Tailwind CSS v4, a single
design-token layer and shadcn/ui primitives. This page explains how they fit together.

Tailwind is compiled by the official `@tailwindcss/turbopack` loader configured in
`next.config.ts`; there is no `tailwind.config` file. All theme configuration lives in CSS.

## Where styles live

| File                                  | Purpose                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/app/globals.css`            | The only CSS entry, imported by `app/layout.tsx`. Imports Tailwind, `tw-animate-css`, the tokens and the surfaces, then holds base styles, the Markdown prose and the editor styles. |
| `frontend/src/styles/tokens.css`      | **All design tokens**, light and dark, and their mapping to Tailwind. The only file that may contain colour values.                       |
| `frontend/src/styles/surfaces.css`    | Surface utilities made from the tokens: `glass`, `glass-flat`, `glass-overlay`, `glass-backdrop`, `field`, `section-label`.               |
| `frontend/src/styles/fonts.ts`        | Self-hosted Geist Sans and Geist Mono via `next/font/local`.                                                                              |
| `frontend/src/styles/theme.ts`        | Theme helpers and the inline no-flash script.                                                                                             |
| `frontend/src/hooks/useTheme.ts`      | React hook for reading and changing the theme.                                                                                            |
| `frontend/src/components/primitives/` | shadcn/ui components (generated, then owned by us).                                                                                       |
| `frontend/src/lib/utils.ts`           | `cn()` to merge class names.                                                                                                              |

## The look

The interface is dark first and calm: a flat `--background`, slightly translucent panels with thin
borders, and blur only on what floats (the sidebar, the top bar and overlays). There are no
gradients, glows, coloured shadows or background images anywhere; the accent is a single solid
colour. Keep it that way: depth comes from `glass*` surfaces, never from decoration.

| Surface            | Use                                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| `glass`            | Floating chrome that content scrolls under: sidebar, top bar.                 |
| `glass-flat`       | Content panels on the flat page: document list, editor panes, list sections. |
| `glass-overlay`    | Popovers, menus, dialogs, the command palette, toasts.                        |
| `glass-backdrop`   | The dimmed layer behind a modal.                                              |
| `field`            | Inset inputs.                                                                 |
| `section-label`    | 11 px uppercase labels above sections.                                        |

When `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set, the tokens swap
`--panel` and `--overlay` for solid values, so no component needs a fallback of its own.

Radii: `rounded-lg` (10 px) for inputs and buttons, `rounded-item` (10 px) for list rows,
`rounded-card` (16 px) for cards, `rounded-panel` (18 px) for panels, `rounded-full` for chips.

## The token file

`src/styles/tokens.css` has three parts:

1. `:root` holds the light values as plain CSS variables (`--background`, `--primary`,
   `--radius`, `--elevation-md`, `--motion-ease`, `--prose-width`...).
2. `.dark` overrides the values that change in dark mode.
3. `@theme inline` maps the variables to Tailwind namespaces, which creates the utilities.

| Group      | Variables                                                                                                                                                                              | Example utilities                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Colour     | `background`, `foreground(-secondary)`, `muted-foreground`, `label`, `panel(-border)`, `overlay(-border)`, `field(-border)`, `hover`, `pressed`, `brand`, `primary(-hover/-foreground)`, `accent-tint/-ring/-text`, `success/warning/destructive` (with `-text`/`-tint`), `star`, and the shadcn/ui names (`border`, `input`, `ring`, `popover`, `secondary`, `accent`) mapped onto them | `bg-background`, `text-muted-foreground`, `bg-accent-tint`, `text-star` |
| Presence   | `presence-1` … `presence-8`, `presence-foreground`: solid avatar fills with white initials                                                                                            | `bg-presence-3`, or `var(--presence-3)` in JS                             |
| Radius     | `--radius` (base, 10 px), scale derived from it, plus `panel`, `card` and `item`                                                                                                       | `rounded-lg`, `rounded-panel`, `rounded-card`, `rounded-item`             |
| Shadow     | `--elevation-xs` … `--elevation-lg`                                                                                                                                                    | `shadow-xs` … `shadow-lg`                                                 |
| Motion     | `--duration-fast` (150ms), `--duration-normal` (200ms), `--motion-ease`                                                                                                                | `duration-(--duration-fast) ease-standard`                                |
| Typography | `--font-ui`, `--font-code`, `--prose-width` (68ch), `--prose-line-height` (1.75)                                                                                                       | `font-sans`, `font-mono`, `max-w-reading`, `leading-reading`              |

Spacing uses Tailwind's default scale; there are no spacing tokens.

Every colour pair used for text is checked for WCAG AA in both themes; the ratios are listed at
the top of `tokens.css`. Re-check them when you change a value.

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
- If the CLI asks to overwrite an existing primitive (for example `dialog.tsx`), answer no: the
  existing ones carry the glass styling.
- Leave `src/styles/tokens.css` and `app/globals.css` as they are; if the CLI adds variables, move
  any genuinely new token into `tokens.css` by hand.
- Run `bun run format` so the generated files follow the project's Prettier style.

`TooltipProvider` and `Toaster` are mounted once, in `AppShell`.

## Dark mode

- The theme is the `dark` class on `<html>`. Tailwind's `dark:` variant is bound to it in
  `tokens.css` (`@custom-variant dark`), and `.dark` swaps the token values.
- Dark is the default. `themeInitScript` (in `src/styles/theme.ts`) runs inline in `<head>` before
  the first paint. It reads `localStorage["marksync-theme"]` (`light`, `dark` or `system`); without
  a stored value it applies dark, and with `system` it follows `prefers-color-scheme` and keeps
  following system changes. This prevents a flash of the wrong theme. `<html>` has
  `suppressHydrationWarning` because the script changes its class before React hydrates.
- In components, use the hook:

  ```tsx
  const { preference, resolvedTheme, setPreference, toggle } = useTheme();
  setPreference("system"); // follow the operating system
  ```

  Changes apply immediately, are persisted, and are picked up by other tabs.

- Outside React, `setThemePreference()` and `toggleTheme()` do the same.
- `color-scheme` is set by the tokens (`light` on `:root`, `dark` on `.dark`), so native controls
  and scrollbars follow the theme.
