import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function Login() {
  const [accountType, setAccountType] = useState('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  function changeAccountType(type) {
    setAccountType(type);
    setEmail('');
    setPassword('');
    setStatus('');
  }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setStatus('');
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Check your .env file.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('email not confirmed')) throw new Error('Please confirm your email before signing in.');
        if (message.includes('invalid login credentials')) throw new Error('Invalid email or password. Check the exact email and the new Supabase password.');
        throw new Error(error.message);
      }

      const { data: profiles, error: profileError } = await supabase.rpc('get_my_profile');
      const profile = profiles?.[0];
      if (profileError || !profile || profile.role !== accountType) {
        await supabase.auth.signOut();
        throw new Error('This account does not match the selected account type.');
      }
      if (profile.role !== 'admin' && !profile.is_verified) {
        await supabase.auth.signOut();
        throw new Error('Your account is waiting for admin verification.');
      }

      const redirect = profile.role === 'admin'
        ? '/dashboard/admin'
        : profile.role === 'caterer'
          ? '/dashboard/caterer'
          : '/dashboard/customer';
      window.location.href = redirect;
    } catch (error) { setStatus(error.message); setLoading(false); }
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-intro"><a className="brand" href="/">Cater<span>AI</span></a><p className="eyebrow">Welcome back</p><h1>Make room for<br /><em>good things.</em></h1><p>Sign in to manage your event, connect with caterers, and keep every detail in one place.</p></div><form className="auth-form" onSubmit={submit}><div className="login-role-header"><div className="account-tabs" role="tablist" aria-label="Account type"><button className={accountType === 'customer' ? 'active' : ''} onClick={() => changeAccountType('customer')} type="button">Customer</button><button className={accountType === 'caterer' ? 'active' : ''} onClick={() => changeAccountType('caterer')} type="button">Caterer</button></div><button className={accountType === 'admin' ? 'admin-login active' : 'admin-login'} onClick={() => changeAccountType('admin')} type="button">Admin</button></div><input type="hidden" name="account_type" value={accountType} /><label htmlFor="email">Email address</label><input id="email" name="email" type="email" placeholder="Enter your email address" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" name="password" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />{status && <p className="form-alert error-alert">{status}</p>}<button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? 'Signing in...' : 'Sign in'} <span>↗</span></button><p className="auth-note">New to CaterAI? <a href={`/register?account_type=${accountType === 'caterer' ? 'caterer' : 'customer'}`}>Create an account</a></p></form></section></main>;
}
