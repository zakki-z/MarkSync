import { cn } from '@/src/lib/utils';

/** Static class names, so Tailwind sees every one of them. */
const FILLS = [
  'bg-presence-1',
  'bg-presence-2',
  'bg-presence-3',
  'bg-presence-4',
  'bg-presence-5',
  'bg-presence-6',
  'bg-presence-7',
  'bg-presence-8',
] as const;

/** The same id always gets the same solid fill. Works for numeric and string ids. */
export function fillFor(id: number | string): string {
  const key = String(id);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return FILLS[Math.abs(hash) % FILLS.length];
}

/** Up to two letters from a name, an email or a username. */
export function initials(name: string): string {
  const base = name.split('@')[0].trim();
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').replace(/\d+$/, '')[0];
  return (letters ?? '?').toUpperCase();
}

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-7 text-[11px]',
  md: 'size-8 text-xs',
  lg: 'size-9 text-[13px]',
} as const;

/** A person: initials on a solid fill picked from their id. Decorative unless `label` is given. */
export function UserAvatar({
  id,
  name,
  size = 'md',
  ring = false,
  className,
  label,
}: {
  id: number | string;
  name: string;
  size?: keyof typeof SIZES;
  /** Marks the current user in a stack of avatars. */
  ring?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-presence-foreground select-none',
        SIZES[size],
        fillFor(id),
        ring && 'ring-2 ring-brand ring-offset-2 ring-offset-background',
        className,
      )}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {initials(name)}
    </span>
  );
}

/** A workspace: its first letter on a small solid tile. */
export function WorkspaceTile({
  id,
  name,
  size = 'sm',
  className,
}: {
  id: number;
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center font-semibold text-presence-foreground select-none',
        size === 'sm' ? 'size-5 rounded-md text-[11px]' : 'size-8 rounded-lg text-[13px]',
        fillFor(`workspace-${id}`),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** The app mark: a solid accent tile. */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground',
        className,
      )}
    >
      M
    </span>
  );
}

/** A keyboard key hint. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-panel-border bg-hover px-1.5 font-sans text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
