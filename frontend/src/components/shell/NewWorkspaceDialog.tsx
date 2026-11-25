'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/primitives/dialog';
import { Input } from '@/src/components/primitives/input';
import { useCreateWorkspace } from '@/src/queries/mutations';

/**
 * Names and creates a workspace. Replaces the old browser prompt with the same rule (the name is
 * trimmed and must not be empty) and the same request; the server validates the rest.
 */
export function NewWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace().mutateAsync;
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setName('');
      setError('');
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError('');
    try {
      const created = await createWorkspace(trimmed);
      toast.success(`Created ${created.name}`);
      setPending(false);
      setName('');
      onOpenChange(false);
      router.push(`/w/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create workspace.');
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader className="flex-row items-center gap-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-tint text-accent-text">
              <FolderPlus className="size-5" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>A shared space for documents and people.</DialogDescription>
            </div>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground-secondary">Workspace name</span>
            <Input
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Design team"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive-tint px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
