import { useState, useEffect } from 'react';
import { login } from '@/lib/auth';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/branding';
import { initTheme } from '@/lib/theme';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => initTheme(), []);

  const doLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) {
      setError('Username and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--c-bg3)',
    border: '1px solid var(--c-border2)',
    borderRadius: 10,
    padding: '12px 14px',
    color: 'var(--c-text)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color .15s',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--c-bg) 0%, #f0f3f8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 20% 50%, rgba(0,86,179,.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(29,185,162,.03) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 100, height: 100, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/assets/clovrix-logo.jpg" alt="CLOVRIX" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-1px', marginBottom: 12 }}>{PRODUCT_NAME}</div>
          <div style={{ fontSize: 12, color: 'var(--c-text3)', fontStyle: 'normal', letterSpacing: '0.08em', fontWeight: 500 }}>{PRODUCT_TAGLINE}</div>
        </div>

        <div style={{ background: 'var(--c-bg2)', border: '1px solid var(--c-border)', borderRadius: 16, padding: 36, boxShadow: '0 4px 6px rgba(0,0,0,.05), 0 10px 20px rgba(0,0,0,.08)', backdropFilter: 'blur(10px)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', marginBottom: 24, letterSpacing: '-0.02em' }}>Sign In</h2>

          {error && (
            <div style={{ background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.3)', borderRadius: 10, padding: '11px 14px', color: 'var(--c-red)', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={doLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--c-text3)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} autoComplete="username" />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: 'var(--c-text3)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="current-password" />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%',
              background: 'linear-gradient(135deg, #0056B3 0%, #0d3d8f 100%)',
              border: 'none',
              borderRadius: 10,
              padding: '13px 20px',
              color: 'white',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              letterSpacing: '0.02em',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(0, 86, 179, 0.3)',
            }}
            onMouseOver={(e) => !loading && (e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 86, 179, 0.4)')}
            onMouseOut={(e) => !loading && (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 86, 179, 0.3)')}>
              {loading ? 'Signing in…' : 'Sign In to Dashboard →'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--c-text3)' }}>
          © 2026 Clovrix · All Rights Reserved
        </div>
      </div>
    </div>
  );
}
