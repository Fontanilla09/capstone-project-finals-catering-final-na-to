import { useEffect, useState } from 'react';
import { BanknoteArrowUp, RefreshCw } from 'lucide-react';
import { requestJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function CatererEarnings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busyPayoutId, setBusyPayoutId] = useState(null);

  async function load() {
    try {
      const { data: earnings, error: loadError } = await supabase.rpc('get_caterer_earnings');
      if (loadError) throw loadError;
      setData(earnings || { summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
      setError('');
    } catch (reason) {
      setError(reason.message);
      setData({ summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePayout(payout, action) {
    if (busyPayoutId !== null) return;
    setBusyPayoutId(payout.id);
    setStatus('');
    setError('');
    try {
      const result = await requestJson('/backend/payout_api.php', {
        method: 'POST',
        body: JSON.stringify({ payout_id: payout.id, action }),
      });
      setStatus(result.message || 'Payout status updated.');
      await load();
    } catch (reason) {
      setError(reason.message);
      await load();
    } finally {
      setBusyPayoutId(null);
    }
  }

  return <DashboardPage role="caterer" section="earnings">
    {error && <p className="form-alert error-alert">{error}</p>}{status && <p className="form-alert success-alert">{status}</p>}
    {!data ? <p>Loading earnings...</p> : <>
      <section className="verification-panel"><h2>PayPal earnings</h2><p>Available payout amounts are net of the platform's 2.5% commission. PayPal may take time to process a requested payout.</p></section>
      <div className="stats-grid">
        <article className="stat-card"><h3>Total earnings</h3><strong>{money(data.summary?.total)}</strong></article>
        <article className="stat-card"><h3>Paid out</h3><strong>{money(data.summary?.paid)}</strong></article>
        <article className="stat-card"><h3>Pending payout</h3><strong>{money(data.summary?.pending)}</strong></article>
      </div>
      <div className="reservation-list">
        {data.payouts.length ? data.payouts.map((payout) => <article className="package-card caterer-payout-card" key={payout.id}>
          <h3>{payout.package_name}</h3>
          <p>Reservation #{payout.reservation_id} · {payout.event_date}</p>
          <p>Gross {money(payout.gross_amount)} · Platform fee {money(payout.platform_fee)}</p>
          <strong>{money(payout.caterer_amount)}</strong>
          <span className={`admin-status admin-status-${payout.payout_status}`}>{payout.payout_status}</span>
          {payout.payout_status === 'pending' && <button className="button button-primary button-small" disabled={busyPayoutId !== null} onClick={() => handlePayout(payout, 'request')} type="button"><BanknoteArrowUp size={15} aria-hidden="true" />{busyPayoutId === payout.id ? 'Requesting...' : 'Request payout'}</button>}
          {payout.payout_status === 'processing' && <button className="button button-secondary button-small" disabled={busyPayoutId !== null} onClick={() => handlePayout(payout, 'status')} type="button"><RefreshCw size={15} aria-hidden="true" />{busyPayoutId === payout.id ? 'Checking...' : 'Check payout status'}</button>}
          {payout.payout_status === 'failed' && <small className="payout-follow-up">Payout failed. Contact support before requesting another transfer.</small>}
        </article>) : <p>No earnings recorded yet.</p>}
      </div>
    </>}
  </DashboardPage>;
}