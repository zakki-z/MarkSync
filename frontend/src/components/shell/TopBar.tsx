'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useShell } from '@/src/components/shell/ShellContext';

export type Crumb = { label: ReactNode; href?: string };

/** Where the page is. The last crumb is the current page. */
export function Breadcrumb({ items, after }: { items: Crumb[]; after?: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={index}>
              {index > 0 && (
                <li aria-hidden="true" className="hidden text-muted-foreground/60 sm:block">
                  /
                </li>
              )}
              <li className={last ? 'min-w-0 truncate' : 'hidden min-w-0 truncate sm:block'}>
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={last ? 'font-medium text-foreground' : 'text-muted-foreground'}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {after}
    </nav>
  );
}

/**
 * The 56 px floating glass bar at the top of every signed-in page. Content scrolls underneath it;
 * the strip above it is painted with the page background so nothing shows through the gap.
 */
export function TopBar({ breadcrumb, children }: { breadcrumb: ReactNode; children?: ReactNode }) {
  const shell = useShell();
  return (
    <div className="sticky top-0 z-30 -mt-3 pt-3">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-3 bg-background" />
      <header className="glass relative flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-panel px-2.5 py-2 sm:px-3">
        {shell && (
          <button
            type="button"
            onClick={shell.openNavigation}
            aria-label="Open navigation"
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground md:hidden"
          >
            <Menu className="size-4" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center">{breadcrumb}</div>
        {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
      </header>
    </div>
  );
}
