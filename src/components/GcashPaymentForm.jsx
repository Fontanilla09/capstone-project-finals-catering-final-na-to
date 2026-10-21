import { useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export default function GcashPaymentForm({ option, onClose, onSubmitted }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!receipt || submitting) return;
    setSubmitting(true);
    setError('');
    let uploadedPath = '';

    try {
      if (!acceptedTypes.includes(receipt.type)) {
        throw new Error('Receipt must be a JPG, PNG, or WEBP image.');
      }
      if (receipt.size > 5 * 1024 * 1024) {
        throw new Error('Receipt image must not exceed 5MB.');
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before uploading your GCash receipt.');

      const extension = receipt.type.split('/')[1].replace('jpeg', 'jpg');
      uploadedPath = `${authData.user.id}/${option.reservation_id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('gcash-payment-receipts')
        .upload(uploadedPath, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: submitError } = await supabase.rpc('submit_gcash_payment', {
        p_reservation_id: option.reservation_id,
        p_payment_type: option.payment_type,
        p_receipt_path: uploadedPath,
      });
      if (submitError) throw submitError;

      onSubmitted();
    } catch (reason) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('gcash-payment-receipts').remove([uploadedPath]);
        if (cleanupError) console.error('Could not remove an unsubmitted GCash receipt:', cleanupError);
      }
      setError(reason.message || 'Could not submit the GCash receipt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payment-receipt-overlay" role="dialog" aria-modal="true" aria-label="Submit GCash payment receipt" onClick={onClose}>
      <article className="payment-receipt gcash-payment-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="payment-receipt-header">
          <div>
            <p className="eyebrow eyebrow-soft">GCash · {option.payment_type === 'balance' ? 'Balance payment' : 'Down payment'}</p>
            <h2>Pay {option.amount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })} PHP</h2>
          </div>
          <button className="payment-receipt-close" onClick={onClose} type="button" aria-label="Close GCash payment"><X size={18} /></button>
        </header>
        <p className="payment-receipt-note">Scan this caterer’s QR code, pay the exact amount, then upload your GCash receipt. The payment stays unconfirmed until the caterer reviews it.</p>
        <img className="gcash-payment-qr" src={option.gcash_qr_code} alt={`GCash QR code for ${option.business_name}`} />
        <form className="gcash-payment-form" onSubmit={submit}>
          <label htmlFor="gcash-payment-receipt">Upload payment receipt</label>
          <input
            id="gcash-payment-receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => { setReceipt(event.target.files?.[0] || null); setError(''); }}
            required
          />
          <small>JPG, PNG, or WEBP · maximum 5MB</small>
          {error && <p className="form-alert error-alert" role="alert">{error}</p>}
          <div className="payment-receipt-actions">
            <button className="button button-primary" disabled={!receipt || submitting} type="submit">
              {submitting ? <><LoaderCircle className="gcash-payment-spinner" size={16} aria-hidden="true" /> Submitting…</> : <><Upload size={16} aria-hidden="true" /> Submit receipt</>}
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
