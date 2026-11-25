'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { safeReturnPath } from '@/src/auth/authState';
import { loginUser, signupUser } from '@/src/authService';
import { BrandTile } from '@/src/components/common/Identity';
import { Button } from '@/src/components/primitives/button';
import { Input } from '@/src/components/primitives/input';
import { cn } from '@/src/lib/utils';

export default function AuthPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setMessage('');
    setError(false);
    try {
      if (isLogin) {
        await loginUser(email, password);
        // A session that ended without signing out (401) leaves its cache behind: drop it.
        queryClient.clear();
        const next = new URLSearchParams(window.location.search).get('next');
        router.replace(safeReturnPath(next) ?? '/documents');
        router.refresh();
        return;
      }
      await signupUser(email, password, username.trim());
      setPassword('');
      setMessage('Signup successful! Please log in.');
      setIsLogin(true);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <section
        className="glass w-full max-w-md rounded-panel p-6 sm:p-10"
        aria-labelledby="auth-title"
      >
        <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground">
          <BrandTile className="size-8" />
          MarkSync
        </div>
        <h1 id="auth-title" className="mt-8 text-2xl font-bold tracking-tight text-foreground">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">
          {isLogin
            ? 'Sign in to your Markdown workspace.'
            : 'A clear space for your notes, ideas, and documents.'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={pending}>
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-foreground-secondary"
            >
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={pending}
              className="h-11"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {!isLogin && (
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-foreground-secondary"
              >
                Username (optional)
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*"
                disabled={pending}
                aria-describedby="username-help"
                className="h-11"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your-name"
              />
              <p id="username-help" className="mt-2 text-xs text-muted-foreground">
                3–32 letters, numbers, dots, underscores or hyphens. Others can invite you with it.
              </p>
            </div>
          )}
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-foreground-secondary"
            >
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={isLogin ? 1 : 8}
              maxLength={128}
              disabled={pending}
              aria-describedby={!isLogin ? 'password-help' : undefined}
              className="h-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {!isLogin && (
              <p id="password-help" className="mt-2 text-xs text-muted-foreground">
                Use 8–128 characters.
              </p>
            )}
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? 'Please wait…' : isLogin ? 'Login' : 'Sign Up'}
          </Button>
          {message && (
            <div
              role={error ? 'alert' : 'status'}
              className={cn(
                'rounded-lg px-3 py-2.5 text-sm',
                error
                  ? 'bg-destructive-tint text-destructive'
                  : 'bg-success-tint text-success-text',
              )}
            >
              {message}
            </div>
          )}
        </form>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage('');
            setPassword('');
          }}
          className="mt-6 min-h-11 w-full cursor-pointer rounded-lg text-sm font-medium text-accent-text hover:underline disabled:opacity-60"
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
        </button>
        <p className="mt-5 border-t border-panel-border pt-5 text-center text-xs leading-5 text-muted-foreground">
          Your documents stay private to your account.
        </p>
      </section>
    </main>
  );
}
