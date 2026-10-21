import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const emptyForm = { full_name: '', business_name: '', email: '', phone: '', address: '', city: '', paypal_email: '', password: '' };

export default function Register() {
  const requestedType = new URLSearchParams(window.location.search).get('account_type');
  const [accountType, setAccountType] = useState(requestedType === 'caterer' ? 'caterer' : 'customer');
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ error: '', success: '' });
  const nameField = accountType === 'customer' ? 'full_name' : 'business_name';
  const confirmationRedirectUrl = `${window.location.origin}/login?confirmed=1`;

  function update(event) {
    const value = event.target.name === 'phone' ? event.target.value.replace(/\D/g, '').slice(0, 15) : event.target.value;
    setForm({ ...form, [event.target.name]: value });
  }

  async function submit(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    try {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured. Check your .env file.');
      const values = Object.fromEntries(new FormData(event.currentTarget));
      if (accountType === 'caterer' && values.gcash_qr_code?.size) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(values.gcash_qr_code.type)) {
          throw new Error('GCash QR code must be a JPG, PNG, or WEBP image.');
        }
        if (values.gcash_qr_code.size > 5 * 1024 * 1024) {
          throw new Error('GCash QR code must not exceed 5MB.');
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: confirmationRedirectUrl,
          data: {
            account_type: accountType,
            full_name: values.full_name || '',
            business_name: values.business_name || '',
            phone: values.phone || '',
            address: values.address || '',
            city: values.city || '',
            paypal_email: values.paypal_email || '',
          },
        },
      });
      if (error) throw new Error(error.message.includes('already registered') ? 'Email already registered.' : error.message);

      if (accountType === 'caterer' && values.business_permit?.size) {
        if (!data.session) {
          setStatus({
            error: '',
            success: `Account created. Email confirmation is required. Check ${values.email} and its spam folder for a confirmation link. After confirming and signing in, upload your business permit and optional GCash QR from Business profile.`,
          });
          setForm(emptyForm);
          return;
        }

        const path = `${data.user.id}/${crypto.randomUUID()}-${values.business_permit.name}`;
        const { error: uploadError } = await supabase.storage.from('permits').upload(path, values.business_permit, { contentType: values.business_permit.type });
        if (uploadError) throw new Error('Account created, but the business permit could not be uploaded.');
        const { error: permitError } = await supabase.rpc('save_my_caterer_permit', { permit_path: path });
        if (permitError) throw new Error('Account created, but the business permit could not be saved.');
      }

      let gcashUploadNotice = '';
      if (accountType === 'caterer' && values.gcash_qr_code?.size && data.session) {
        let uploadedQrPath = '';
        try {
          const { data: profileRows, error: profileError } = await supabase.rpc('get_my_profile');
          if (profileError) throw profileError;
          const catererId = profileRows?.[0]?.caterer_id;
          if (!catererId) throw new Error('Caterer profile is not available yet.');

          const authUserId = data.user.id;
          const extension = values.gcash_qr_code.type.split('/')[1].replace('jpeg', 'jpg');
          uploadedQrPath = `${authUserId}/${catererId}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('caterer-gcash-qr')
            .upload(uploadedQrPath, values.gcash_qr_code, { contentType: values.gcash_qr_code.type, upsert: false });
          if (uploadError) throw uploadError;

          const { data: publicUrl } = supabase.storage.from('caterer-gcash-qr').getPublicUrl(uploadedQrPath);
          const { error: updateError } = await supabase
            .from('caterers')
            .update({ gcash_qr_code: publicUrl.publicUrl })
            .eq('id', catererId);
          if (updateError) throw updateError;
        } catch (qrError) {
          if (uploadedQrPath) {
            const { error: cleanupError } = await supabase.storage.from('caterer-gcash-qr').remove([uploadedQrPath]);
            if (cleanupError) console.error('Could not remove an unsaved registration GCash QR:', cleanupError);
          }
          gcashUploadNotice = ` Your account was created, but the GCash QR could not be saved (${qrError.message}). You can upload it later from Business profile.`;
        }
      }

      const success = data.session
        ? 'Account created. Email confirmation appears to be disabled in Supabase, so no confirmation email was requested. Sign in after admin approval.'
        : `Account created. Email confirmation is required. Check ${values.email} and its spam folder for a confirmation link. If no email arrives, check Supabase email confirmation and SMTP settings.`;
      setStatus({ error: '', success: `${success}${gcashUploadNotice}` });
      setForm(emptyForm);
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    }
  }

  return (
    <main className="auth-page">
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
          {status.success && <p className="form-alert success-alert">{status.success}</p>}
          <label htmlFor="register-name">{accountType === 'customer' ? 'Full name' : 'Business name'}</label>
          <input id="register-name" name={nameField} value={form[nameField]} onChange={update} placeholder={accountType === 'customer' ? 'Your full name' : 'Your catering business'} required />
          <label htmlFor="register-email">Email address</label>
          <input id="register-email" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required />
          <label htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10,15}" maxLength="15" value={form.phone} onChange={update} placeholder="09XXXXXXXXX" required />
          {accountType === 'caterer' && <>
            <div className="caterer-registration-fields">
              <label htmlFor="register-address">Address<input id="register-address" name="address" value={form.address} onChange={update} placeholder="Business address" required /></label>
              <label htmlFor="register-city">City<input id="register-city" name="city" value={form.city} onChange={update} placeholder="City" required /></label>
              <label className="registration-field-wide" htmlFor="register-paypal">PayPal email<input id="register-paypal" name="paypal_email" type="email" value={form.paypal_email} onChange={update} placeholder="PayPal account email" required /></label>
            </div>
          </>}
          {accountType === 'caterer' && <>
            <label htmlFor="business-permit">Business permit
              <input id="business-permit" name="business_permit" type="file" accept="application/pdf,image/jpeg,image/png" required />
              <small>PDF, JPG, or PNG. Maximum 10MB.</small>
            </label>
            <label className="registration-gcash-field" htmlFor="register-gcash-qr">
              GCash payment QR <span className="registration-optional">(recommended · optional)</span>
              <input id="register-gcash-qr" name="gcash_qr_code" type="file" accept="image/jpeg,image/png,image/webp" />
              <small>Add your own GCash QR now so customers can pay their down payment or balance through GCash. JPG, PNG, or WEBP · maximum 5MB. You can also add it later from Business profile.</small>
            </label>
          </>}
          <label htmlFor="register-password">Password</label>
          <input id="register-password" name="password" type="password" value={form.password} onChange={update} placeholder="At least 6 characters" minLength="6" required />
          <button className="button button-primary auth-submit" type="submit">Create account <span>↗</span></button>
          <p className="auth-note">Already registered? <a href="/login">Sign in</a></p>
        </form>
      </section>
    </main>
  );
}
