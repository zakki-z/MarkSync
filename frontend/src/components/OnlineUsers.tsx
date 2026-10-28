'use client';

import { useEffect, useState } from 'react';

import { parsePresenceMessage, type OnlineUser } from '@/src/presence';

export function OnlineUsers({
  documentId,
  onSessionExpired,
}: {
  documentId: number | null;
  onSessionExpired: () => void;
}) {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [status, setStatus] = useState('Connecting…');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (documentId === null) return;
    let disposed = false;
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
    );
    let lastPong = Date.now();
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', documentId }));
    };
    socket.onmessage = (event) => {
      if (disposed) return;
      try {
        const message = parsePresenceMessage(String(event.data));
        if (!message) {
          socket.close();
          return;
        }
        if (message.type === 'pong') lastPong = Date.now();
        if (
          message.type === 'presence' &&
          message.documentId === documentId &&
          Array.isArray(message.users)
        ) {
          setUsers(message.users);
          setStatus('Connected');
        }
        if (message.type === 'error') {
          setUsers([]);
          setStatus('Presence unavailable');
          if (message.code === 'UNAUTHORIZED') onSessionExpired();
        }
      } catch {
        socket.close();
      }
    };
    socket.onclose = (event) => {
      if (disposed) return;
      setUsers([]);
      setStatus('Presence disconnected');
      if (event.code === 4401) onSessionExpired();
    };
    socket.onerror = () => {
      if (!disposed) setStatus('Presence unavailable');
    };
    const heartbeat = setInterval(() => {
      if (Date.now() - lastPong > 45_000) {
        socket.close();
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, 15_000);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    };
  }, [documentId, onSessionExpired, attempt]);

  if (documentId === null) return null;
  const sessions = users.reduce((total, user) => total + user.sessions, 0);
  return (
    <section
      aria-label="Online Users"
      className="mb-6 rounded-lg border border-slate-200 bg-white p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">
          Online Users <span className="text-blue-700">({users.length})</span>
        </h2>
        <span role="status" className="text-xs text-slate-600">
          {status === 'Connected'
            ? `${sessions} active ${sessions === 1 ? 'session' : 'sessions'}`
            : status}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="max-w-full break-all rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800"
          >
            {user.email}
            {user.sessions > 1 ? ` · ${user.sessions} sessions` : ''}
          </li>
        ))}
      </ul>
      {status.startsWith('Presence') && (
        <button
          type="button"
          className="mt-2 min-h-9 rounded text-blue-700 underline"
          onClick={() => {
            setStatus('Connecting…');
            setAttempt(attempt + 1);
          }}
        >
          Reconnect presence
        </button>
      )}
    </section>
  );
}
