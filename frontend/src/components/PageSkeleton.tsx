import { Brand } from '@/src/components/ui';

type Variant = 'documents' | 'document' | 'list';

const pulse = 'animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none';

const Bar = ({ className }: { className: string }) => (
  <div className={`${pulse} ${className}`} aria-hidden="true" />
);

/**
 * What a signed-in page looks like before its data arrives. It uses the real layout classes, so
 * the sidebar, top bar and content area are already where they will be and nothing moves when the
 * data lands. `label` stays in the page as hidden text for screen readers.
 */
export function PageSkeleton({ variant, label }: { variant: Variant; label: string }) {
  return (
    <main className="workspace" aria-busy="true">
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <Bar className="mb-5 h-10" />
        <Bar className="mb-5 h-5 w-32" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Bar key={row} className="h-8" />
          ))}
        </div>
      </aside>
      <section className="editor-workspace">
        <p className="sr-only" role="status">
          {label}
        </p>
        <header className="workspace-topbar" aria-hidden="true">
          <Bar className="h-5 w-56" />
          <Bar className="h-10 w-36" />
        </header>
        <div className="editor-body" aria-hidden="true">
          {variant === 'document' ? (
            <>
              <div className="editor-heading">
                <Bar className="h-3 w-32" />
                <Bar className="mt-4 h-10 w-3/4" />
              </div>
              <div className="editing-surface">
                <Bar className="m-7 h-4 w-2/3" />
                <Bar className="m-7 h-4 w-1/2" />
              </div>
            </>
          ) : (
            <>
              <Bar className="mb-4 h-10" />
              <div className="flex flex-col gap-1">
                {Array.from({ length: variant === 'documents' ? 6 : 4 }, (_, row) => (
                  <Bar key={row} className="h-14" />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
