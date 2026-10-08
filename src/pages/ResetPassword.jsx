import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState({ error: '', success: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus({ error: 'Supabase is not configured. Check your environment settings.', success: '' });
      return undefined;
    }

    const callbackParams = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = callbackParams.get('error_code') || callbackParams.get('error');
    if (callbackError) {
      const message = callbackError === 'otp_expired'
        ? 'This reset link has expired or was already used. Request a new link and open the latest email.'
        : 'This reset link is invalid. Request a new one and try again.';
      setStatus({ error: message, success: '' });
      return undefined;
    }

    let active = true;
    const recoveryLink = callbackParams.get('type') === 'recovery';
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true);
        setStatus({ error: '', success: '' });
      } else if (event === 'SIGNED_OUT') {
        setReady(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active) return;
      if (error) {
        setStatus({ error: error.message, success: '' });
      } else if (session && recoveryLink) {
        setReady(true);
      } else if (!session) {
        setStatus({ error: 'This password reset link is invalid or has expired. Request a new one.', success: '' });
      }
    }).catch((error) => {
      if (active) setStatus({ error: error.message, success: '' });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    if (password !== confirmPassword) {
      setStatus({ error: 'The passwords do not match.', success: '' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      await supabase.auth.signOut();
      setStatus({ error: '', success: 'Your password has been updated. You can now sign in.' });
      setReady(false);
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-intro"><a className="brand" href="/">Cater<span>AI</span></a><p className="eyebrow">Account recovery</p><h1>A fresh start,<br /><em>securely.</em></h1><p>Choose a new password for your CaterAI account.</p></div><form className="auth-form" onSubmit={submit}><h2>Set a new password</h2>{ready ? <><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength="6" placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} required /><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength="6" placeholder="Enter your new password again" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? 'Updating...' : 'Update password'} <span>↗</span></button></> : null}{status.error && <p className="form-alert error-alert" role="alert">{status.error}</p>}{status.success && <p className="form-alert success-alert" role="status">{status.success}</p>}<p className="auth-note"><a href={status.success ? '/login' : '/forgot-password'}>{status.success ? 'Back to sign in' : 'Request another reset link'}</a></p></form></section></main>;
}
