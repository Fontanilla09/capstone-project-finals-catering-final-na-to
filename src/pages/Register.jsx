import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Eye, EyeOff, FileText, LockKeyhole, Mail, Phone, Store, UploadCloud, UserRound, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const emptyForm = { full_name: '', business_name: '', email: '', phone: '', address: '', city: '', paypal_email: '', password: '' };

function maskEmail(email) {
  const [localPart, domain] = email.split('@');
  return `${localPart.slice(0, Math.min(2, localPart.length))}•••@${domain}`;
}

export default function Register() {
  const requestedType = new URLSearchParams(window.location.search).get('account_type');
  const [accountType, setAccountType] = useState(requestedType === 'caterer' ? 'caterer' : 'customer');
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ error: '', success: '' });
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [catererStep, setCatererStep] = useState(1);
  const [permitName, setPermitName] = useState('');
  const [gcashName, setGcashName] = useState('');
  const passwordStrength = form.password.length >= 12 ? 4 : form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : form.password.length >= 6 ? 1 : 0;
  const formRef = useRef(null);
  const permitInputRef = useRef(null);
  const gcashInputRef = useRef(null);
  const confirmationModalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const nameField = accountType === 'customer' ? 'full_name' : 'business_name';
  const confirmationRedirectUrl = `${window.location.origin}/login?confirmed=1`;

  useEffect(() => {
    if (!confirmationEmail) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmationModalRef.current?.focus();

    function closeOnEscape(event) {
      if (event.key === 'Escape') setConfirmationEmail('');
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      previousFocusRef.current?.focus?.();
    };
  }, [confirmationEmail]);

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === 'phone' ? value.replace(/\D/g, '').slice(0, 15) : value,
    }));
  }

  function changeAccountType(type) {
    setAccountType(type);
    setCatererStep(1);
    setStatus({ error: '', success: '' });
    if (permitInputRef.current) permitInputRef.current.value = '';
    if (gcashInputRef.current) gcashInputRef.current.value = '';
    setPermitName('');
    setGcashName('');
  }

  async function resendConfirmation() {
    setResendingConfirmation(true);
    setResendStatus('');
    try {
      if (!isSupabaseConfigured) throw new Error('Email confirmation is temporarily unavailable. Please try again later.');
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationEmail,
        options: { emailRedirectTo: confirmationRedirectUrl },
      });
      if (error) throw new Error(error.message);
      setResendStatus('A new verification email is on its way. Check your inbox and spam folder.');
    } catch (error) {
      setResendStatus(error.message);
    } finally {
      setResendingConfirmation(false);
    }
  }

  function validateCurrentStep() {
    const panel = formRef.current?.querySelector(
      `[data-register-step="${accountType === 'caterer' ? catererStep : 'customer'}"]`,
    );
    const invalidInput = [...(panel?.querySelectorAll('input') || [])]
      .find((input) => !input.checkValidity());

    if (invalidInput) {
      invalidInput.reportValidity();
      return false;
    }

    if (accountType === 'caterer' && catererStep === 2) {
      const permit = permitInputRef.current?.files?.[0];
      if (permit && !['application/pdf', 'image/jpeg', 'image/png'].includes(permit.type)) {
        setStatus({ error: 'Business permit must be a PDF, JPG, or PNG file.', success: '' });
        permitInputRef.current.focus();
        return false;
      }
      if (permit && permit.size > 10 * 1024 * 1024) {
        setStatus({ error: 'Business permit must not exceed 10MB.', success: '' });
        permitInputRef.current.focus();
        return false;
      }
    }

    if (accountType === 'caterer' && catererStep === 3) {
      const qr = gcashInputRef.current?.files?.[0];
      if (qr && !['image/jpeg', 'image/png', 'image/webp'].includes(qr.type)) {
        setStatus({ error: 'GCash QR code must be a JPG, PNG, or WEBP image.', success: '' });
        gcashInputRef.current.focus();
        return false;
      }
      if (qr && qr.size > 5 * 1024 * 1024) {
        setStatus({ error: 'GCash QR code must not exceed 5MB.', success: '' });
        gcashInputRef.current.focus();
        return false;
      }
    }

    return true;
  }

  async function submit(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    if (!validateCurrentStep()) return;

    if (accountType === 'caterer' && catererStep < 3) {
      setCatererStep((step) => step + 1);
      return;
    }

    setSubmitting(true);

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
        email: values.email.trim(),
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
      if (error) {
        throw new Error(error.message.includes('already registered') ? 'Email already registered.' : error.message);
      }

      if (accountType === 'caterer' && values.business_permit?.size) {
        if (!data.session) {
          setConfirmationEmail(values.email.trim());
          setForm(emptyForm);
          setCatererStep(1);
          setPermitName('');
          setGcashName('');
          formRef.current?.reset();
          return;
        }

        const path = `${data.user.id}/${crypto.randomUUID()}-${values.business_permit.name}`;
        const { error: uploadError } = await supabase.storage
          .from('permits')
          .upload(path, values.business_permit, { contentType: values.business_permit.type });
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

          const extension = values.gcash_qr_code.type.split('/')[1].replace('jpeg', 'jpg');
          uploadedQrPath = `${data.user.id}/${catererId}/${crypto.randomUUID()}.${extension}`;
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

      if (!data.session) {
        setConfirmationEmail(values.email.trim());
        setResendStatus('');
      } else {
        setStatus({
          error: '',
          success: `Your account was created. You can sign in after it is approved by an administrator.${gcashUploadNotice}`,
        });
      }
      setForm(emptyForm);
      setCatererStep(1);
      setPermitName('');
      setGcashName('');
      formRef.current?.reset();
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="register-page">
      <section className="register-shell" aria-label="Create an account">
        <aside className="register-welcome">
          <a className="register-brand" href="/" aria-label="CaterAI home">Cater<span>AI</span></a>
          <div className="register-welcome-copy">
            <p className="register-eyebrow">{accountType === 'customer' ? 'MADE FOR YOUR NEXT CELEBRATION' : 'GROW YOUR CATERING BUSINESS'}</p>
            <h1>{accountType === 'customer' ? <>Good plans<br /><em>start here.</em></> : <>More bookings<br /><em>start here.</em></>}</h1>
            <p className="register-welcome-description">
              {accountType === 'customer'
                ? 'Find trusted catering partners and bring your next gathering to life.'
                : 'Set up your business profile so customers can find, book, and pay you.'}
            </p>
            {accountType === 'customer' ? (
              <ul className="register-benefits">
                {['Discover verified caterers', 'Book your event with confidence', 'Keep your plans in one place'].map((benefit) => (
                  <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
                ))}
              </ul>
            ) : (
              <ol className="register-step-rail" aria-label="Registration steps">
                {['Account', 'Business', 'Payouts'].map((step, index) => {
                  const stepNumber = index + 1;
                  const complete = catererStep > stepNumber;
                  return (
                    <li className={catererStep === stepNumber ? 'current' : complete ? 'complete' : ''} key={step}>
                      <span className="register-step-rail-marker">
                        {complete ? <Check size={13} aria-hidden="true" /> : stepNumber}
                      </span>
                      <span>{step}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <p className="register-welcome-footer">Thoughtful gatherings begin with CaterAI.</p>
        </aside>

        <div className="register-content">
          <div className="register-account-tabs" role="tablist" aria-label="Account type">
            <button
              aria-selected={accountType === 'customer'}
              className={accountType === 'customer' ? 'active' : ''}
              onClick={() => changeAccountType('customer')}
              role="tab"
              type="button"
            >
              <UserRound size={15} aria-hidden="true" /> Customer
            </button>
            <button
              aria-selected={accountType === 'caterer'}
              className={accountType === 'caterer' ? 'active' : ''}
              onClick={() => changeAccountType('caterer')}
              role="tab"
              type="button"
            >
              <Store size={15} aria-hidden="true" /> Caterer
            </button>
          </div>

          {accountType === 'caterer' && (
            <div className="register-progress" aria-label={`Step ${catererStep} of 3`}>
              <div className="register-progress-track"><span style={{ width: `${(catererStep / 3) * 100}%` }} /></div>
              <p>Step {catererStep} of 3</p>
            </div>
          )}

          <div className="register-heading">
            {accountType === 'customer' ? (
              <>
                <p className="register-eyebrow">YOUR CATERAI ACCOUNT</p>
                <h2>Create your account</h2>
                <p>Join to plan and book your next event.</p>
              </>
            ) : (
              <>
                <p className="register-eyebrow">STEP {catererStep} OF 3</p>
                <h2>{['Account', 'Business', 'Payouts'][catererStep - 1]}</h2>
                <p>{[
                  'Create your login and tell us how to reach you.',
                  'Add your business location and verification document.',
                  'Choose where to receive payouts and add an optional GCash QR.',
                ][catererStep - 1]}</p>
              </>
            )}
          </div>

          <form className={`register-form ${accountType === 'caterer' ? 'is-caterer' : ''}`} encType="multipart/form-data" onSubmit={submit} ref={formRef} noValidate>
            {status.error && <p className="register-feedback is-error" role="alert">{status.error}</p>}
            {status.success && <p className="register-feedback is-success" role="status">{status.success}</p>}

            <section className="register-step-panel" data-register-step={accountType === 'caterer' ? '1' : 'customer'} hidden={accountType === 'caterer' && catererStep !== 1}>
            <div className="register-field">
              <label htmlFor="register-name">{accountType === 'customer' ? 'Full name' : 'Business name'}</label>
              <div className="register-input-wrap">
                {accountType === 'customer' ? <UserRound size={18} aria-hidden="true" /> : <Store size={18} aria-hidden="true" />}
                <input
                  autoComplete={accountType === 'customer' ? 'name' : 'organization'}
                  id="register-name"
                  maxLength={100}
                  name={nameField}
                  onChange={update}
                  placeholder={accountType === 'customer' ? 'Enter your full name' : 'Enter your catering business name'}
                  required
                  value={form[nameField]}
                />
              </div>
            </div>

            <div className="register-field">
              <label htmlFor="register-email">{accountType === 'customer' ? 'Email address' : 'Business email address'}</label>
              <div className="register-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input autoComplete="email" id="register-email" name="email" onChange={update} placeholder="you@example.com" required type="email" value={form.email} />
              </div>
            </div>

            <div className="register-field">
              <label htmlFor="register-phone">Phone number</label>
              <div className="register-input-wrap">
                <Phone size={18} aria-hidden="true" />
                <input
                  autoComplete="tel"
                  id="register-phone"
                  inputMode="numeric"
                  maxLength={15}
                  name="phone"
                  onChange={update}
                  pattern="[0-9]{10,15}"
                  placeholder="09XXXXXXXXX"
                  required
                  type="tel"
                  value={form.phone}
                />
              </div>
              <small>Enter 10 to 15 digits, numbers only.</small>
            </div>

            {accountType === 'caterer' ? (
              <>
                <div className="register-field">
                  <label htmlFor="register-password">Password</label>
                  <div className="register-input-wrap">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      autoComplete="new-password"
                      id="register-password"
                      minLength={6}
                      name="password"
                      onChange={update}
                      placeholder="At least 6 characters"
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                    />
                    <button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="register-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  {accountType === 'caterer' && (
                    <div className="register-password-strength" aria-live="polite">
                      <span className="register-strength-bars" aria-hidden="true">
                        {[1, 2, 3, 4].map((level) => <i className={level <= passwordStrength ? `level-${passwordStrength}` : ''} key={level} />)}
                      </span>
                      <span>{passwordStrength ? ['','Weak','Fair','Good','Strong'][passwordStrength] : 'Use at least 6 characters'}</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="register-field">
                  <label htmlFor="register-password">Password</label>
                  <div className="register-input-wrap">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      autoComplete="new-password"
                      id="register-password"
                      minLength={6}
                      name="password"
                      onChange={update}
                      placeholder="At least 6 characters"
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                    />
                    <button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="register-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </>
            )}
            {accountType === 'customer' && (
              <button className="register-submit" disabled={submitting} type="submit">
                {submitting ? 'Creating account...' : 'Create customer account'}
                {!submitting && <ArrowRight size={17} aria-hidden="true" />}
              </button>
            )}
            </section>

            {accountType === 'caterer' && (
              <>
                <section className="register-step-panel" data-register-step="2" hidden={catererStep !== 2}>
                <div className="register-caterer-fields">
                  <div className="register-field">
                    <label htmlFor="register-address">Business address</label>
                    <div className="register-input-wrap">
                      <input autoComplete="street-address" id="register-address" name="address" onChange={update} placeholder="Street and barangay" required value={form.address} />
                    </div>
                  </div>
                  <div className="register-field">
                    <label htmlFor="register-city">City</label>
                    <div className="register-input-wrap">
                      <input autoComplete="address-level2" id="register-city" name="city" onChange={update} placeholder="City or municipality" required value={form.city} />
                    </div>
                  </div>
                </div>
                <div className="register-field">
                  <label htmlFor="register-permit">Business permit</label>
                  <div className={`register-file-drop ${permitName ? 'has-file' : ''}`}>
                    <input
                      accept="application/pdf,image/jpeg,image/png"
                      id="register-permit"
                      name="business_permit"
                      onChange={(event) => setPermitName(event.target.files?.[0]?.name || '')}
                      ref={permitInputRef}
                      required
                      type="file"
                    />
                    {permitName ? (
                      <>
                        <FileText size={20} aria-hidden="true" />
                        <span className="register-file-info"><strong>{permitName}</strong><small>Ready to upload</small></span>
                        <button aria-label="Remove business permit" className="register-file-remove" onClick={() => { permitInputRef.current.value = ''; setPermitName(''); }} type="button"><X size={16} /></button>
                      </>
                    ) : (
                      <label className="register-file-picker" htmlFor="register-permit">
                        <span className="register-file-icon"><UploadCloud size={19} aria-hidden="true" /></span>
                        <span className="register-file-info"><strong>Upload business permit</strong><small>PDF, JPG, or PNG · Maximum 10MB</small></span>
                        <span className="register-file-action">Browse</span>
                      </label>
                    )}
                  </div>
                </div>
                </section>

                <section className="register-step-panel" data-register-step="3" hidden={catererStep !== 3}>
                <div className="register-field">
                  <label htmlFor="register-paypal">PayPal email</label>
                  <div className="register-input-wrap">
                    <Mail size={18} aria-hidden="true" />
                    <input autoComplete="email" id="register-paypal" name="paypal_email" onChange={update} placeholder="PayPal account email" required type="email" value={form.paypal_email} />
                  </div>
                  <small>This is where we send your payouts.</small>
                </div>
                <div className="register-field">
                  <div className="register-upload-heading">
                    <label htmlFor="register-gcash-qr">GCash payment QR</label>
                    <span>Optional</span>
                  </div>
                  <div className={`register-file-drop register-gcash-drop ${gcashName ? 'has-file' : ''}`}>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      id="register-gcash-qr"
                      name="gcash_qr_code"
                      onChange={(event) => setGcashName(event.target.files?.[0]?.name || '')}
                      ref={gcashInputRef}
                      type="file"
                    />
                    {gcashName ? (
                      <>
                        <FileText size={20} aria-hidden="true" />
                        <span className="register-file-info"><strong>{gcashName}</strong><small>Ready to upload</small></span>
                        <button aria-label="Remove GCash QR" className="register-file-remove" onClick={() => { gcashInputRef.current.value = ''; setGcashName(''); }} type="button"><X size={16} /></button>
                      </>
                    ) : (
                      <label className="register-file-picker" htmlFor="register-gcash-qr">
                        <span className="register-file-icon"><UploadCloud size={19} aria-hidden="true" /></span>
                        <span className="register-file-info"><strong>Upload your GCash QR</strong><small>JPG, PNG, or WEBP · Up to 5MB</small></span>
                        <span className="register-file-action">Browse</span>
                      </label>
                    )}
                  </div>
                  <small>Customers can pay their down payment through GCash. You can also add this later in Business profile.</small>
                </div>
                </section>

                <div className="register-step-actions">
                  {catererStep > 1 && (
                    <button className="register-back-button" onClick={() => { setCatererStep((step) => step - 1); setStatus({ error: '', success: '' }); }} type="button">
                      <ArrowLeft size={16} aria-hidden="true" /> Back
                    </button>
                  )}
                  <button className="register-submit" disabled={submitting} type="submit">
                    {submitting ? 'Creating account...' : catererStep < 3 ? 'Continue' : 'Create account'}
                    {!submitting && catererStep < 3 && <ArrowRight size={17} aria-hidden="true" />}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="register-signin">Already have an account? <a href="/login">Sign in</a></p>
          <p className="register-privacy">Your information is used to set up and secure your account.</p>
        </div>
      </section>
      {confirmationEmail && (
        <div
          className="register-confirmation-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmationEmail('');
          }}
        >
          <section
            aria-labelledby="register-confirmation-title"
            aria-modal="true"
            className="register-confirmation-modal"
            ref={confirmationModalRef}
            role="dialog"
            tabIndex={-1}
          >
            <button
              aria-label="Close email verification message"
              className="register-confirmation-close"
              onClick={() => setConfirmationEmail('')}
              type="button"
            >
              <X size={19} aria-hidden="true" />
            </button>
            <span className="register-confirmation-icon"><CircleCheck size={27} aria-hidden="true" /></span>
            <p className="register-eyebrow">ONE LAST STEP</p>
            <h2 id="register-confirmation-title">Check your email</h2>
            <p className="register-confirmation-copy">
              We sent a verification link to <strong>{maskEmail(confirmationEmail)}</strong>.
              Open the email and click the link to verify your account.
            </p>
            <p className="register-confirmation-hint">Can’t find it? Check your spam or junk folder.</p>
            {accountType === 'caterer' && (
              <p className="register-confirmation-hint">
                After verifying and signing in, you can upload your business permit and GCash QR from your Business Profile.
              </p>
            )}
            {resendStatus && (
              <p className="register-confirmation-feedback" role="status">{resendStatus}</p>
            )}
            <a className="register-confirmation-primary" href="https://mail.google.com/" rel="noreferrer" target="_blank">
              <Mail size={17} aria-hidden="true" /> Open Gmail
            </a>
            <button
              className="register-confirmation-resend"
              disabled={resendingConfirmation}
              onClick={resendConfirmation}
              type="button"
            >
              {resendingConfirmation ? 'Sending...' : 'Resend verification email'}
            </button>
            <a className="register-confirmation-login" href="/login">Return to sign in</a>
          </section>
        </div>
      )}
    </main>
  );
}
