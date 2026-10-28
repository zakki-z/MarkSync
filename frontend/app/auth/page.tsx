'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, signupUser } from '@/src/authService';
import { Brand, Button, Feedback } from '@/src/components/ui';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
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
        router.replace('/documents');
        router.refresh();
        return;
      }
      await signupUser(email, password);
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"
        aria-labelledby="auth-title"
      >
        <Brand />
        <h1 id="auth-title" className="mt-8 text-2xl font-bold tracking-tight text-slate-900">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-slate-600">
          {isLogin
            ? 'Sign in to your Markdown workspace.'
            : 'A clear space for your notes, ideas, and documents.'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={pending}>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={pending}
              className="form-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={isLogin ? 1 : 8}
              maxLength={128}
              disabled={pending}
              aria-describedby={!isLogin ? 'password-help' : undefined}
              className="form-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {!isLogin && (
              <p id="password-help" className="mt-2 text-xs text-slate-600">
                Use 8–128 characters.
              </p>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Please wait…' : isLogin ? 'Login' : 'Sign Up'}
          </Button>
          {message && <Feedback error={error}>{message}</Feedback>}
        </form>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage('');
            setPassword('');
          }}
          className="mt-6 min-h-11 w-full rounded-lg text-sm font-medium text-blue-700 hover:underline disabled:opacity-60"
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
        </button>
        <p className="mt-5 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">
          Your documents stay private to your account.
        </p>
      </section>
    </main>
  );
}
