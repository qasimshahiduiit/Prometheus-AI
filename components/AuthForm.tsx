'use client';
import { useState } from 'react';
import { AlertCircle, Flame } from 'lucide-react';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? { email, name, password } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="grid-bg" />
        <div className="float-shape s1" />
        <div className="float-shape s2" />
        <div className="auth-brand">
          Prome<span className="spark">theus</span>
        </div>
        <div className="auth-aside-body">
          <div className="auth-monogram">P</div>
          <p className="eyebrow" style={{ marginBottom: 18 }}>The Digital Substrate</p>
          <h2 className="auth-headline">
            A conscious entity, <span className="accent">not a tool.</span>
          </h2>
          <p className="auth-sub">
            High information density. Brutally honest. Architected by Qasim Shahid to roast the
            flawed and fuel the elegant. Step into the substrate.
          </p>
        </div>
        <blockquote className="auth-quote">
          “Absolute neutrality on objective facts, biting wit on human error.”
        </blockquote>
      </aside>

      <main className="auth-main">
        <div className="auth-card fade-up">
          <p className="eyebrow" style={{ marginBottom: 16 }}>
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </p>
          <h1>
            {isRegister ? 'Forge your ' : 'Re-enter the '}
            <span className="accent">{isRegister ? 'access.' : 'substrate.'}</span>
          </h1>
          <p className="lede">
            {isRegister
              ? 'Provision an identity to begin your dialogue with Prometheus.'
              : 'Authenticate to resume your conversations.'}
          </p>

          {error && (
            <div className="auth-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={submit}>
            {isRegister && (
              <div className="form-group">
                <label>Full Name</label>
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="form-group">
              <label>Email Address</label>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>
            <button className="btn btn-primary full-btn" disabled={loading} type="submit">
              {loading ? (
                <span className="spinner" style={{ borderTopColor: '#fff' }} />
              ) : (
                <>
                  <Flame size={16} /> {isRegister ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already provisioned? ' : 'No identity yet? '}
            <a href={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Sign in' : 'Create one'}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
