import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function CatererEarnings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data, error: loadError } = await supabase.rpc('get_caterer_earnings');
        if (loadError) throw loadError;
        setData(data || { summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
      } catch (reason) {
        setError(reason.message);
        setData({ summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
      }
    }
    load();
  }, []);

  return <DashboardPage role="caterer" section="earnings">
    {error && <p className="form-alert error-alert">{error}</p>}{status && <p className="form-alert success-alert">{status}</p>}
    {!data ? <p>Loading earnings...</p> : <>
      <section className="verification-panel"><h2>PayPal earnings</h2><p>Completed online payments are sent directly to your PayPal account.</p></section>
      <div className="stats-grid">
        <article className="stat-card"><h3>Total earnings</h3><strong>{money(data.summary?.total)}</strong></article>
        <article className="stat-card"><h3>Paid directly</h3><strong>{money(data.summary?.paid)}</strong></article>
        <article className="stat-card"><h3>Pending direct payments</h3><strong>{money(data.summary?.pending)}</strong></article>
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