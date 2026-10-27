'use client';

import React, { useState } from 'react';
import { loginUser, signupUser } from '@/src/authService';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      if (isLogin) {
        const data = await loginUser(email, password);
        setToken(data.access_token);
        setMessage('Login successful! Token received.');
      } else {
        await signupUser(email, password, role);
        setMessage('Signup successful! Please log in.');
        setIsLogin(true);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>{isLogin ? 'Login to MarkSync AI' : 'Sign Up for MarkSync AI'}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        {!isLogin && (
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}
        <button type="submit" style={{ padding: '10px', background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>

      <button
        onClick={() => setIsLogin(!isLogin)}
        style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', marginTop: '15px' }}
      >
        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
      </button>

      {message && <p style={{ marginTop: '15px', color: message.startsWith('Error') ? 'red' : 'green' }}>{message}</p>}
      {token && (
        <div style={{ marginTop: '15px', wordBreak: 'break-all', background: '#f0f0f0', padding: '10px' }}>
          <strong>JWT Token:</strong> {token}
        </div>
      )}
    </div>
  );
}
