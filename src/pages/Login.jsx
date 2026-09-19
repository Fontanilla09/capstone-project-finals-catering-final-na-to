import { useState } from 'react';
import { requestJson } from '../lib/api';

export default function Login() {
  const [accountType, setAccountType] = useState('customer');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setLoading(true); setStatus('');
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const result = await requestJson('/backend/login_api.php', { method: 'POST', body: JSON.stringify(data) });
      window.location.href = result.redirect;
    } catch (error) { setStatus(error.message); setLoading(false); }
  }

  return <main className="auth-page"><a className="auth-back" href="/">← Back to home</a><section className="auth-card"><div className="auth-intro"><a className="brand" href="/">Cater<span>AI</span></a><p className="eyebrow">Welcome back</p><h1>Make room for<br /><em>good things.</em></h1><p>Sign in to manage your event, connect with caterers, and keep every detail in one place.</p></div><form className="auth-form" onSubmit={submit}><div className="login-role-header"><div className="account-tabs" role="tablist" aria-label="Account type"><button className={accountType === 'customer' ? 'active' : ''} onClick={() => setAccountType('customer')} type="button">Customer</button><button className={accountType === 'caterer' ? 'active' : ''} onClick={() => setAccountType('caterer')} type="button">Caterer</button></div><button className={accountType === 'admin' ? 'admin-login active' : 'admin-login'} onClick={() => setAccountType('admin')} type="button">Admin</button></div><input type="hidden" name="account_type" value={accountType} /><label htmlFor="email">Email address</label><input id="email" name="email" type="email" placeholder="you@example.com" required /><label htmlFor="password">Password</label><input id="password" name="password" type="password" placeholder="Enter your password" required />{status && <p className="form-alert error-alert">{status}</p>}<button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? 'Signing in...' : 'Sign in'} <span>↗</span></button><p className="auth-note">New to CaterAI? <a href="/register">Create an account</a></p></form></section></main>;
}
