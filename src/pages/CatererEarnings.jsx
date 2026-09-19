import { useEffect, useState } from 'react';
import { API_BASE, requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function CatererEarnings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => { requestJson('/backend/dashboard_api.php?action=caterer_earnings').then(setData).catch((reason) => setError(reason.message)); }, []);

  async function uploadQr(event) {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData(); formData.append('gcash_qr_code', file);
    try {
      const response = await fetch(`${API_BASE}/backend/gcash_qr_upload_api.php`, { method: 'POST', credentials: 'include', body: formData });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to upload GCash QR.');
      setStatus('GCash QR code saved.'); setData((current) => ({ ...current, gcash_qr_code: result.filename }));
    } catch (reason) { setError(reason.message); }
  }

  return <DashboardPage role="caterer" section="earnings">
    {error && <p className="form-alert error-alert">{error}</p>}{status && <p className="form-alert success-alert">{status}</p>}
    {!data ? <p>Loading earnings...</p> : <>
      <section className="verification-panel"><h2>GCash payment setup</h2><p>Upload the GCash QR code generated in your GCash app. Customers will use it to pay the booking down payment.</p>{data.gcash_qr_code && <img className="gcash-qr-preview" src={`/uploads/gcash/${data.gcash_qr_code}`} alt="Your GCash payment QR code" />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadQr} /></section>
      <div className="stats-grid">
        <article className="stat-card"><h3>Total earnings</h3><strong>{money(data.summary?.total)}</strong></article>
        <article className="stat-card"><h3>Paid out</h3><strong>{money(data.summary?.paid)}</strong></article>
        <article className="stat-card"><h3>Pending payout</h3><strong>{money(data.summary?.pending)}</strong></article>
      </div>
      <div className="reservation-list">
        {data.payouts.length ? data.payouts.map((payout) => <article className="package-card" key={payout.id}>
          <h3>{payout.package_name}</h3>
          <p>Reservation #{payout.reservation_id} · {payout.event_date}</p>
          <p>Gross {money(payout.gross_amount)} · Platform fee {money(payout.platform_fee)}</p>
          <strong>{money(payout.caterer_amount)}</strong>
          <span className={`admin-status admin-status-${payout.payout_status}`}>{payout.payout_status}</span>
        </article>) : <p>No earnings recorded yet.</p>}
      </div>
    </>}
  </DashboardPage>;
}