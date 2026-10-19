import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Flower2, LockKeyhole, Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusIsSuccess, setStatusIsSuccess] = useState(false);
  const [resendAvailable, setResendAvailable] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(
    new URLSearchParams(window.location.search).get('confirmed') === '1',
  );

  async function submit(event) {
    event.preventDefault(); setLoading(true); setStatus(''); setStatusIsSuccess(false); setResendAvailable(false); setEmailConfirmed(false);
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
      if (profileError || !profile) {
        await supabase.auth.signOut();
        if (profileError) throw new Error(profileError.message);
        throw new Error('Could not find a profile for this account.');
      }
      if (profile.role !== 'admin' && !profile.is_verified) {
        if (profile.role === 'caterer') {
          const { data: suspensionReason, error: suspensionError } = await supabase.rpc('get_my_caterer_suspension_reason');
          if (suspensionError) throw new Error(suspensionError.message);
          if (suspensionReason) {
            await supabase.auth.signOut();
            throw new Error(`Your caterer account has been restricted by the admin. Reason: ${suspensionReason}`);
          }
        }
        const { data: rejectionReason, error: rejectionError } = await supabase.rpc('get_my_rejection_reason');
        await supabase.auth.signOut();
        if (rejectionError) throw new Error(rejectionError.message);
        if (rejectionReason) throw new Error(`Your account was rejected by the admin. Reason: ${rejectionReason}`);
        throw new Error('Your account is waiting for admin verification.');
      }

      const redirect = profile.role === 'admin'
        ? '/dashboard/admin'
        : profile.role === 'caterer'
          ? '/dashboard/caterer'
          : '/dashboard/customer';
      window.location.href = redirect;
    } catch (error) {
      setStatus(error.message);
      setStatusIsSuccess(false);
      setResendAvailable(error.message.toLowerCase().includes('confirm your email'));
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setResending(true);
    setStatus('');
    setStatusIsSuccess(false);
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Check your .env file.');
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
      });
      if (error) throw new Error(error.message);
      setStatus('If this email has an unconfirmed account, a new confirmation link has been sent.');
      setStatusIsSuccess(true);
      setResendAvailable(false);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setResending(false);
    }
  }

  return <main className="auth-page login-page">
    <section className="auth-card login-card">
      <div className="auth-intro login-intro">
        <a className="brand" href="/">Cater<span>AI</span></a>
        <div className="login-art" aria-hidden="true">
          <span className="login-art-label">A DAY TO REMEMBER</span>
          <div className="login-art-arch" />
          <div className="login-art-flower flower-one"><Flower2 size={54} strokeWidth={1.1} /></div>
          <div className="login-art-flower flower-two"><Flower2 size={38} strokeWidth={1.1} /></div>
          <div className="login-art-leaf leaf-one" />
          <div className="login-art-leaf leaf-two" />
          <div className="login-art-ribbon" />
          <div className="login-art-caption"><span>YOUR VISION, THOUGHTFULLY STYLED</span><strong>Every detail has a place.</strong></div>
        </div>
        <div className="login-story-copy">
          <p className="eyebrow">For the days worth gathering</p>
          <h1>Make space for<br /><em>what matters.</em></h1>
          <p>Find the people and finishing touches to make your celebration feel like yours.</p>
        </div>
        <div className="login-intro-note"><Flower2 size={17} aria-hidden="true" /><span>Good celebrations start with a feeling.</span></div>
      </div>

      <form className="auth-form login-form" onSubmit={submit}>
        <div className="login-form-heading">
          <p className="eyebrow">YOUR CATERAI ACCOUNT</p>
          <h2>Welcome back</h2>
          <p>Customers, decorators, and administrators all sign in here.</p>
        </div>
        <div className="login-field">
          <label htmlFor="email">Email address</label>
          <div className="login-input-wrap">
            <Mail size={17} aria-hidden="true" />
            <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
        </div>
        <div className="login-field">
          <label htmlFor="password">Password</label>
          <div className="login-input-wrap">
            <LockKeyhole size={17} aria-hidden="true" />
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="login-password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <p className="auth-note auth-forgot"><a href="/forgot-password">Forgot password?</a></p>
        {emailConfirmed && <p className="form-alert success-alert" role="status">Email confirmed. You can now sign in, subject to admin approval.</p>}
        {status && <p className={`form-alert ${statusIsSuccess ? 'success-alert' : 'error-alert'}`} role={statusIsSuccess ? 'status' : 'alert'}>{status}</p>}
        {resendAvailable && <button className="auth-note" disabled={resending || !email.trim()} onClick={resendConfirmation} type="button">{resending ? 'Sending confirmation...' : 'Didn’t receive the email? Resend confirmation'}</button>}
        <button className="button button-primary auth-submit" disabled={loading} type="submit">
          {loading ? 'Signing in...' : 'Sign in'}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <p className="auth-note login-register-note">New to CaterAI? <a href="/register">Create an account <ArrowRight size={14} aria-hidden="true" /></a></p>
        <p className="login-secure-note"><LockKeyhole size={13} aria-hidden="true" /> Your account details are kept private.</p>
      </form>
    </section>
  </main>;
}
