import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ error: '', success: '' });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ error: '', success: '' });

    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Check your environment settings.');
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(error.message);
      setStatus({
        error: '',
        success: 'If an account exists for that email, password reset instructions will be sent.',
      });
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-intro"><a className="brand" href="/">Cater<span>AI</span></a><p className="eyebrow">Account recovery</p><h1>Let’s get you<br /><em>back in.</em></h1><p>Enter the email address connected to your account and we’ll send reset instructions if it exists.</p></div><form className="auth-form" onSubmit={submit}><h2>Forgot password?</h2><p className="auth-description">We’ll email you a secure link to choose a new password.</p><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="Enter your email address" value={email} onChange={(event) => setEmail(event.target.value)} required />{status.error && <p className="form-alert error-alert">{status.error}</p>}{status.success && <p className="form-alert success-alert" role="status">{status.success}</p>}<button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? 'Sending...' : 'Send reset link'} <span>↗</span></button><p className="auth-note"><a href="/login">Back to sign in</a></p></form></section></main>;
}
