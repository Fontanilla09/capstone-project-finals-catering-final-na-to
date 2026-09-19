import { useState } from 'react';
import { requestJson } from '../lib/api';

const emptyForm = { full_name: '', business_name: '', email: '', phone: '', password: '' };

export default function Register() {
  const [accountType, setAccountType] = useState('customer');
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ error: '', success: '' });
  const nameField = accountType === 'customer' ? 'full_name' : 'business_name';

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    try {
      const data = new FormData(event.currentTarget);
      data.set('account_type', accountType);
      const result = await requestJson('/backend/register_api.php', { method: 'POST', body: data });
      setStatus({ error: '', success: result.message });
      setForm(emptyForm);
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    }
  }

  return (
    <main className="auth-page">
      <a className="auth-back" href="/">← Back to home</a>
      <section className="auth-card">
        <div className="auth-intro">
          <a className="brand" href="/">Cater<span>AI</span></a>
          <p className="eyebrow">Make it official</p>
          <h1>Good plans<br /><em>start here.</em></h1>
          <p>Create your account and bring your next gathering to life with trusted catering partners.</p>
        </div>
        <form className="auth-form" onSubmit={submit} encType="multipart/form-data">
          <div className="account-tabs">
            <button className={accountType === 'customer' ? 'active' : ''} onClick={() => setAccountType('customer')} type="button">Customer</button>
            <button className={accountType === 'caterer' ? 'active' : ''} onClick={() => setAccountType('caterer')} type="button">Caterer</button>
          </div>
          {status.error && <p className="form-alert error-alert">{status.error}</p>}
          {status.success && <p className="form-alert success-alert">{status.success} <a href="/login">Sign in</a></p>}
          <label htmlFor="register-name">{accountType === 'customer' ? 'Full name' : 'Business name'}</label>
          <input id="register-name" name={nameField} value={form[nameField]} onChange={update} placeholder={accountType === 'customer' ? 'Your full name' : 'Your catering business'} required />
          <label htmlFor="register-email">Email address</label>
          <input id="register-email" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required />
          <label htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={update} placeholder="09XXXXXXXXX" required />
          {accountType === 'caterer' && <label htmlFor="business-permit">Business permit
            <input id="business-permit" name="business_permit" type="file" accept="application/pdf,image/jpeg,image/png" required />
            <small>PDF, JPG, or PNG. Maximum 10MB.</small>
          </label>}
          <label htmlFor="register-password">Password</label>
          <input id="register-password" name="password" type="password" value={form.password} onChange={update} placeholder="At least 6 characters" minLength="6" required />
          <button className="button button-primary auth-submit" type="submit">Create account <span>↗</span></button>
          <p className="auth-note">Already registered? <a href="/login">Sign in</a></p>
        </form>
      </section>
    </main>
  );
}
