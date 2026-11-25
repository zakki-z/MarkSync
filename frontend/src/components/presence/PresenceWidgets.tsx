'use client';

import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
import { MessagesSquare, SendHorizontal, UserPlus } from 'lucide-react';
import { useUser } from '@/src/auth/AuthProvider';
import { UserAvatar } from '@/src/components/common/Identity';
import { Button } from '@/src/components/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/primitives/popover';
import {
  useOnlineUsers,
  usePresenceMessages,
  usePresenceStatus,
  useSendMessage,
} from '@/src/components/presence/WorkspacePresence';
import { cn } from '@/src/lib/utils';
import { MAX_TEXT_LENGTH, type PublicUser } from '@/src/presence/protocol';
import type { ConnectionStatus } from '@/src/presence/WorkspacePresenceClient';

/*
 * Leaves of the top bar that show workspace presence. Each reads only its own slice of the shared
 * presence store, so a user joining or a message arriving re-renders these and nothing else.
 */

const STATUS: Record<ConnectionStatus, { label: string; tone: string; dot: string }> = {
  connected: { label: 'Live', tone: 'bg-success-tint text-success-text', dot: 'bg-success' },
  connecting: { label: 'Connecting', tone: 'bg-warning-tint text-warning-text', dot: 'bg-warning' },
  reconnecting: {
    label: 'Reconnecting',
    tone: 'bg-warning-tint text-warning-text',
    dot: 'bg-warning',
  },
  disconnected: { label: 'Offline', tone: 'bg-hover text-muted-foreground', dot: 'bg-label' },
  revoked: {
    label: 'Access revoked',
    tone: 'bg-destructive-tint text-destructive',
    dot: 'bg-destructive',
  },
};

export function StatusPill({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  const { label, tone, dot } = STATUS[status];
  return (
    <span
      role="status"
      aria-label={`Workspace connection: ${label}`}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

/** The "Live" pill: the state of the workspace presence connection. */
export const LiveStatus = memo(function LiveStatus({ className }: { className?: string }) {
  const status = usePresenceStatus();
  return status ? <StatusPill status={status} className={className} /> : null;
});

/** The signed-in user first, then everyone else in the server's order. */
function ordered(users: PublicUser[], me?: number) {
  const self = users.filter((user) => user.id === me);
  return [...self, ...users.filter((user) => user.id !== me)];
}

const MAX_STACK = 4;

function HereNow({
  users,
  me,
  workspaceName,
  onInvite,
}: {
  users: PublicUser[];
  me?: number;
  workspaceName: string;
  onInvite?: () => void;
}) {
  const status = usePresenceStatus();
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-overlay-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Here now</h2>
          <p className="truncate text-xs text-muted-foreground">Online in {workspaceName}</p>
        </div>
        {status && <StatusPill status={status} />}
      </div>
      <ul aria-label="Online Users" className="max-h-72 overflow-y-auto p-1.5">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-2.5 rounded-item px-2.5 py-2">
            <UserAvatar id={user.id} name={user.displayName} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {user.displayName}
              {user.id === me && <span className="text-muted-foreground"> (you)</span>}
            </span>
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          </li>
        ))}
      </ul>
      {onInvite && (
        <div className="border-t border-overlay-border p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onInvite}>
            <UserPlus /> Invite to {workspaceName}
          </Button>
        </div>
      )}
    </>
  );
}

/** The avatar stack of who is online; opens the "Here now" popover. */
export const PresenceAvatars = memo(function PresenceAvatars({
  workspaceName,
  onInvite,
}: {
  workspaceName: string;
  /** Present when the user may invite people to this workspace. */
  onInvite?: () => void;
}) {
  const users = useOnlineUsers();
  const me = useUser()?.id;
  const [open, setOpen] = useState(false);
  if (!users?.length) return null;
  const sorted = ordered(users, me);
  const shown = sorted.slice(0, MAX_STACK);
  const overflow = sorted.length - shown.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${users.length} online. Show who is here`}
        className="flex h-8 cursor-pointer items-center rounded-full pr-1 pl-1 transition-colors hover:bg-hover data-[state=open]:bg-hover"
      >
        <span className="flex -space-x-1.5">
          {shown.map((user) => (
            <UserAvatar
              key={user.id}
              id={user.id}
              name={user.displayName}
              size="sm"
              className={user.id === me ? 'ring-2 ring-brand' : 'ring-2 ring-background'}
            />
          ))}
        </span>
        {overflow > 0 && (
          <span className="ml-1 text-xs font-medium text-muted-foreground">+{overflow}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" aria-label="Here now">
        <HereNow
          users={sorted}
          me={me}
          workspaceName={workspaceName}
          onInvite={
            onInvite &&
            (() => {
              setOpen(false);
              onInvite();
            })
          }
        />
      </PopoverContent>
    </Popover>
  );
});

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Messages go to everyone online in the workspace, including other tabs of the same user. */
function ChatPanel() {
  const status = usePresenceStatus();
  const users = useOnlineUsers() ?? [];
  const messages = usePresenceMessages() ?? [];
  const send = useSendMessage();
  const me = useUser()?.id;
  const [text, setText] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const disabled = status !== 'connected';

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() && send(text)) setText('');
  };

  return (
    <section aria-label="Workspace messages" className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-overlay-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Workspace chat</h2>
        <span className="text-xs text-muted-foreground">{users.length} online</span>
      </div>
      {status === 'revoked' && (
        <p
          role="alert"
          className="mx-3 mt-3 rounded-lg bg-destructive-tint px-3 py-2 text-xs text-destructive"
        >
          Your access to this workspace was revoked.
        </p>
      )}
      {messages.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <MessagesSquare
            className="mx-auto mb-2 size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium text-foreground">No messages yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Messages reach everyone online in this workspace right now.
          </p>
        </div>
      ) : (
        <ol
          ref={log}
          aria-live="polite"
          className="flex max-h-80 flex-col gap-3 overflow-y-auto p-3"
        >
          {messages.map((message) => (
            <li key={message.id} className="flex gap-2.5">
              <UserAvatar id={message.sender.id} name={message.sender.displayName} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 text-xs">
                  <strong className="font-semibold text-foreground">
                    {message.sender.displayName}
                    {message.sender.id === me ? ' (you)' : ''}
                  </strong>
                  <span className="text-muted-foreground">{time(message.sentAt)}</span>
                </p>
                <p className="text-[13px] [overflow-wrap:anywhere] text-foreground-secondary">
                  {message.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-overlay-border p-2.5"
      >
        <input
          aria-label="Message"
          placeholder="Message everyone online"
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          className="field h-9 min-w-0 flex-1 rounded-lg px-3 text-[13px] text-foreground placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button type="submit" size="icon-sm" aria-label="Send" disabled={disabled || !text.trim()}>
          <SendHorizontal />
        </Button>
      </form>
    </section>
  );
}

/** The chat button of the top bar, with the workspace chat in a popover. */
export const ChatButton = memo(function ChatButton() {
  const status = usePresenceStatus();
  if (!status) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Workspace chat">
          <MessagesSquare />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label="Workspace chat">
        <ChatPanel />
      </PopoverContent>
    </Popover>
  );
});
