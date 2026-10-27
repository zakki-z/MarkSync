'use client';

import React, { useRef, useState } from 'react';
import { loginUser, signupUser } from '@/src/authService';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const token = useRef<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setMessage('');
    try {
      if (isLogin) {
        const data = await loginUser(email, password);
        token.current = data.access_token;
        setMessage('Login successful!');
      } else {
        await signupUser(email, password);
        setMessage('Signup successful! Please log in.');
        setIsLogin(true);
      }
    } catch (err: unknown) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Authentication failed. Please try again.'}`);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>{isLogin ? 'Login to MarkSync AI' : 'Sign Up for MarkSync AI'}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '5px' }}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" disabled={pending} style={{ padding: '10px', background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {pending ? 'Please wait…' : isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>

      <button
        disabled={pending}
        onClick={() => setIsLogin(!isLogin)}
        style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', marginTop: '15px' }}
      >
        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
      </button>

      {message && <p style={{ marginTop: '15px', color: message.startsWith('Error') ? 'red' : 'green' }}>{message}</p>}
    </div>
  );
}
