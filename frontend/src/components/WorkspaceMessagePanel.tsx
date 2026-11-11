import { useState } from 'react';
import { MAX_TEXT_LENGTH } from '@/src/presence/protocol';
import type { ChatMessage } from '@/src/presence/WorkspacePresenceClient';

type Props = {
  messages: ChatMessage[];
  currentUserId: number;
  /** Returns false when the message could not be sent because the connection is not ready. */
  onSend: (text: string) => boolean;
  disabled: boolean;
};

/** Messages go to everyone online in the workspace, including other tabs of the same user. */
export function WorkspaceMessagePanel({ messages, currentUserId, onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text.trim() && onSend(text)) setText('');
  };
  return (
    <section aria-label="Workspace messages">
      <h3 className="presence-heading">Messages</h3>
      <ul className="message-log" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id}>
            <strong>
              {message.sender.displayName}
              {message.sender.id === currentUserId ? ' (you)' : ''}
            </strong>{' '}
            {message.text}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={submit}>
        <input
          className="field"
          aria-label="Message"
          placeholder="Message everyone online"
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="button" type="submit" disabled={disabled || !text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
