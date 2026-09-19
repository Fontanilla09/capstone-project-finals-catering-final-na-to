import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

function statusClass(status) { return `admin-status admin-status-${status}`; }

export default function AdminDashboard() {
  const [data, setData] = useState({ caterers: [], customers: [], stats: {}, payouts: [] });
  const [status, setStatus] = useState('');

  async function load() {
    try {
      const [pendingCaterers, pendingCustomers, overview] = await Promise.all([
        requestJson('/backend/dashboard_api.php?action=admin_pending'),
        requestJson('/backend/dashboard_api.php?action=admin_pending_customers'),
        requestJson('/backend/dashboard_api.php?action=admin_overview'),
      ]);
      setData({ caterers: pendingCaterers.caterers || [], customers: pendingCustomers.customers || [], stats: overview.stats || {}, payouts: overview.payouts || [] });
    } catch (error) { setStatus(error.message); }
  }

  useEffect(() => { load(); }, []);

  async function decideCaterer(action, id) {
    try { await requestJson(`/backend/dashboard_api.php?action=${action}`, { method: 'POST', body: JSON.stringify({ caterer_id: id }) }); setStatus(action === 'approve_caterer' ? 'Caterer verified.' : 'Verification rejected.'); load(); } catch (error) { setStatus(error.message); }
  }

  async function decideCustomer(action, id) {
    try { await requestJson(`/backend/dashboard_api.php?action=${action}`, { method: 'POST', body: JSON.stringify({ customer_id: id }) }); setStatus(action === 'approve_customer' ? 'Customer verified.' : 'Customer verification rejected.'); load(); } catch (error) { setStatus(error.message); }
  }

  const pendingCount = Number(data.stats.pending || 0) + Number(data.stats.customer_pending || 0);
  return <DashboardPage role="admin"><div className="admin-workspace">
    {status && <p className="form-alert error-alert">{status}</p>}
    <div className="admin-intro"><div><p className="eyebrow">Operations center</p><h2>Keep CaterAI moving.</h2><p>Review accounts, monitor payouts, and handle the actions that need your attention.</p></div><button className="admin-refresh" onClick={load} type="button">Refresh data</button></div>
    <div className="admin-stats">{[['Caterers', data.stats.caterers, 'Registered partners'], ['Verified', data.stats.verified, 'Approved caterers'], ['Customers', data.stats.customers, 'Registered customers'], ['Needs review', pendingCount, 'Accounts waiting']].map(([label, value, hint]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{value ?? 0}</strong><small>{hint}</small></article>)}</div>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Account access</p><h3>Pending approvals</h3></div><span className="admin-section-count">{data.customers.length + data.caterers.length} waiting</span></div><div className="admin-approval-grid"><div><h4>Customers <span>{data.customers.length}</span></h4>{data.customers.length ? data.customers.map((customer) => <article className="admin-record" key={customer.id}><div><strong>{customer.full_name}</strong><small>{customer.user_email} · {customer.phone}</small><small>Registered {customer.created_at}</small></div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCustomer('approve_customer', customer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCustomer('reject_customer', customer.id)} type="button">Reject</button></div></article>) : <p className="admin-empty">No customer approvals waiting.</p>}</div><div><h4>Caterers <span>{data.caterers.length}</span></h4>{data.caterers.length ? data.caterers.map((caterer) => <article className="admin-record" key={caterer.id}><div><strong>{caterer.business_name}</strong><small>{caterer.user_email} · {caterer.city || 'No city provided'}</small><small>Permit: {caterer.business_permit ? 'Uploaded' : 'Missing'}</small>{caterer.business_permit && <a className="admin-inline-link" href={`/uploads/permits/${caterer.business_permit}`} target="_blank" rel="noreferrer">View permit ↗</a>}</div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCaterer('approve_caterer', caterer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCaterer('reject_caterer', caterer.id)} type="button">Reject</button></div></article>) : <p className="admin-empty">No caterer approvals waiting.</p>}</div></div></section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Money movement</p><h3>Payouts</h3></div><span className="admin-section-count">{data.payouts.length} records</span></div>{data.payouts.length ? <div className="admin-payout-list">{data.payouts.map((item) => <article className="admin-payout" key={item.id}><div className="admin-payout-main"><span className="admin-payout-icon">₱</span><div><strong>{item.business_name}</strong><small>{item.package_name} · Reservation #{item.reservation_id}</small><small>Amount to caterer: ₱{Number(item.caterer_amount).toLocaleString()}</small></div></div><div className="admin-payout-action"><span className={statusClass(item.payout_status)}>{item.payout_status}</span></div></article>)}</div> : <p className="admin-empty">No payout records found.</p>}</section>
  </div></DashboardPage>;
}
