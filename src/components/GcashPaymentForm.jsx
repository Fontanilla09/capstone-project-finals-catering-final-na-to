import { useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { requestJson } from '../lib/api';

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

    try {
      if (!acceptedTypes.includes(receipt.type)) {
        throw new Error('Receipt must be a JPG, PNG, or WEBP image.');
      }
      if (receipt.size > 5 * 1024 * 1024) {
        throw new Error('Receipt image must not exceed 5MB.');
      }

      const form = new FormData();
      form.append('receipt', receipt);
      form.append('reservation_id', String(option.reservation_id));
      form.append('payment_type', option.payment_type);
      await requestJson('/backend/gcash_receipt_api.php', { method: 'POST', body: form });
      onSubmitted();
    } catch (reason) {
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
        <p className="payment-receipt-note">Scan this caterer’s QR code, pay the exact amount, then upload your GCash receipt. We’ll screen the image for possible AI generation, but the caterer must still verify the payment in GCash.</p>
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
              {submitting ? <><LoaderCircle className="gcash-payment-spinner" size={16} aria-hidden="true" /> Screening receipt…</> : <><Upload size={16} aria-hidden="true" /> Scan & submit receipt</>}
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
