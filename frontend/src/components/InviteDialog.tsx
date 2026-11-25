'use client';

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from '@/src/components/common/Identity';
import { RoleBadge } from '@/src/components/common/ListRow';
import { memberName } from '@/src/components/MemberList';
import { Button } from '@/src/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/primitives/select';
import { Skeleton } from '@/src/components/primitives/skeleton';
import { useWorkspaceName } from '@/src/components/WorkspaceTabs';
import { useMembers } from '@/src/hooks/useMembers';
import { cn } from '@/src/lib/utils';
import { queryKeys } from '@/src/queries/keys';
import { sendInvitation, type Invitation, type Role } from '@/src/workspaceService';

type Tag = { value: string; error?: string };

/** The roles an invitation can carry, as the API accepts them (owners are promoted later). */
const INVITE_ROLES: { value: Role; label: string }[] = [
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
];

const MAX_IDENTIFIER = 254;
const SEPARATORS = /[\s,;]+/;

/** Splits typed or pasted text into new tags, ignoring empty parts and duplicates. */
export function addTags(tags: Tag[], text: string): Tag[] {
  const known = new Set(tags.map((tag) => tag.value.toLowerCase()));
  const added: Tag[] = [];
  for (const part of text.split(SEPARATORS)) {
    const value = part.trim().slice(0, MAX_IDENTIFIER);
    if (!value || known.has(value.toLowerCase())) continue;
    known.add(value.toLowerCase());
    added.push({ value });
  }
  return [...tags, ...added];
}

function InviteForm({ workspaceId, onDone }: { workspaceId: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const name = useWorkspaceName(workspaceId) ?? 'this workspace';
  const members = useMembers(workspaceId);
  const [tags, setTags] = useState<Tag[]>([]);
  const [draft, setDraft] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const commitDraft = () => {
    if (!draft.trim()) return tags;
    const next = addTags(tags, draft);
    setTags(next);
    setDraft('');
    return next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      if (!draft.trim()) return;
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!SEPARATORS.test(text.trim())) return;
    event.preventDefault();
    setTags(addTags(tags, draft + text));
    setDraft('');
  };

  /** One request per person, through the same endpoint as before; failures stay as tags. */
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const all = commitDraft();
    if (!all.length || pending) return;
    setPending(true);
    const failed: Tag[] = [];
    const sent: Invitation[] = [];
    for (const tag of all) {
      try {
        sent.push(await sendInvitation(workspaceId, tag.value, role));
      } catch (err: unknown) {
        failed.push({
          value: tag.value,
          error: err instanceof Error ? err.message : 'Unable to send the invitation.',
        });
      }
    }
    if (sent.length) {
      queryClient.setQueryData<Invitation[]>(
        queryKeys.workspaceInvitations(workspaceId, true),
        (invitations) => [...sent.reverse(), ...(invitations ?? [])],
      );
      toast.success(
        sent.length === 1
          ? `Invited ${all.find((tag) => !failed.some((f) => f.value === tag.value))?.value}`
          : `Sent ${sent.length} invitations`,
      );
    }
    setPending(false);
    setTags(failed);
    if (!failed.length) onDone();
    else input.current?.focus();
  };

  const errors = tags.filter((tag) => tag.error);
  return (
    <form onSubmit={submit} className="grid gap-5" aria-busy={pending}>
      <DialogHeader className="flex-row items-center gap-3 pr-8 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-tint text-accent-text">
          <UserPlus className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 gap-1">
          <DialogTitle className="truncate">Invite people to {name}</DialogTitle>
          <DialogDescription>
            Add usernames or emails. They will find the invitation in MarkSync.
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <label
            htmlFor="invite-identifiers"
            className="text-xs font-medium text-foreground-secondary"
          >
            Usernames or emails
          </label>
          <div
            className="field flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 focus-within:border-ring focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
            onClick={() => input.current?.focus()}
          >
            {tags.map((tag) => (
              <span
                key={tag.value}
                className={cn(
                  'inline-flex h-6 max-w-full items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-medium',
                  tag.error
                    ? 'bg-destructive-tint text-destructive'
                    : 'bg-accent-tint text-accent-text',
                )}
              >
                <span className="truncate">{tag.value}</span>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove ${tag.value}`}
                  onClick={() => setTags(tags.filter((other) => other.value !== tag.value))}
                  className="grid size-4 cursor-pointer place-items-center rounded-full hover:bg-hover"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              ref={input}
              id="invite-identifiers"
              value={draft}
              disabled={pending}
              maxLength={MAX_IDENTIFIER}
              placeholder={tags.length ? '' : 'name@example.com, username'}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={commitDraft}
              className="h-6 min-w-32 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span id="invite-role-label" className="text-xs font-medium text-foreground-secondary">
            Role
          </span>
          <Select value={role} onValueChange={(value) => setRole(value as Role)} disabled={pending}>
            <SelectTrigger aria-labelledby="invite-role-label" className="h-10 w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {INVITE_ROLES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="grid gap-1 rounded-lg bg-destructive-tint px-3 py-2 text-xs text-destructive"
        >
          {errors.map((tag) => (
            <li key={tag.value}>
              <strong className="font-semibold">{tag.value}</strong>: {tag.error}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="already-in" className="grid gap-2">
        <h3 id="already-in" className="section-label">
          Already in {name}
        </h3>
        <ul className="-mx-1 max-h-44 overflow-y-auto px-1">
          {members.loading
            ? [0, 1].map((row) => <Skeleton key={row} className="my-1 h-9 rounded-item" />)
            : members.data?.map((member) => (
                <li
                  key={member.userId}
                  className="flex h-10 items-center gap-2.5 rounded-item px-1.5"
                >
                  <UserAvatar id={member.userId} name={memberName(member)} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {memberName(member)}
                  </span>
                  <RoleBadge role={member.role} />
                </li>
              ))}
        </ul>
      </section>

      <DialogFooter className="border-t border-overlay-border pt-4">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (!tags.length && !draft.trim())}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Invite people to <workspace>", for owners. Opened through the shell from any page. */
export function InviteDialog({
  workspaceId,
  onClose,
}: {
  workspaceId?: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={workspaceId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        {workspaceId !== undefined && (
          <InviteForm key={workspaceId} workspaceId={workspaceId} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
