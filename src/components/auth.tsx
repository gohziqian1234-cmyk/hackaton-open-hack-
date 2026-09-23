'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLoop } from './provider';
import { Button, Card } from './ui';
import { safeNext } from '../lib/safe-next';

export function Auth() {
  const { act, busy } = useLoop(),
    router = useRouter(),
    next = safeNext(useSearchParams().get('next')),
    [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body =
      mode === 'signin'
        ? { action: 'signin', email: String(f.get('email')), password: String(f.get('password')) }
        : {
            action: 'signup',
            name: String(f.get('name')),
            email: String(f.get('email')),
            password: String(f.get('password')),
          };
    if (await act(body)) router.push(next);
  };
  return (
    <section className="wrap page-pad auth-page">
      <h1>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
      <p className="lead">
        {mode === 'signin'
          ? 'Welcome back. Your boxes and trades are waiting.'
          : 'One account for collecting, trading and applying as a partner.'}
      </p>
      <Card className="auth-card">
        <div className="segmented" role="group" aria-label="Choose">
          <button aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>
            I have an account
          </button>
          <button aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
            I’m new here
          </button>
        </div>
        <form className="form" onSubmit={submit} key={mode}>
          {mode === 'signup' && (
            <label>
              Display name
              <input name="name" required minLength={1} maxLength={60} autoComplete="nickname" />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === 'signup' ? 10 : 1}
              maxLength={128}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>
          {mode === 'signup' && (
            <p className="note">At least 10 characters. A short sentence is easiest to remember.</p>
          )}
          <Button type="submit" wide disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create my account'}
          </Button>
        </form>
        <p className="note">
          Five wrong passwords lock the account for 15 minutes. We never show whether an email is
          registered when a sign-in fails.
        </p>
      </Card>
    </section>
  );
}
