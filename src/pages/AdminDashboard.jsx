import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState('');

  async function load() {
    try {
      const overview = await requestJson('/backend/dashboard_api.php?action=admin_overview');
      setStats(overview.stats || {});
    } catch (error) { setStatus(error.message); }
  }

  useEffect(() => { load(); }, []);

  const pendingCount = Number(stats.pending || 0) + Number(stats.customer_pending || 0);
  return <DashboardPage role="admin"><div className="admin-workspace">
    {status && <p className="form-alert error-alert">{status}</p>}
    <div className="admin-intro"><div><p className="eyebrow">Operations center</p><h2>Keep CaterAI moving.</h2><p>Review accounts, monitor payouts, and handle the actions that need your attention.</p></div><button className="admin-refresh" onClick={load} type="button">Refresh data</button></div>
    <div className="admin-stats">{[['Caterers', stats.caterers, 'Registered partners'], ['Verified', stats.verified, 'Approved caterers'], ['Customers', stats.customers, 'Registered customers'], ['Needs review', pendingCount, 'Accounts waiting']].map(([label, value, hint]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{value ?? 0}</strong><small>{hint}</small></article>)}</div>
    <a className="button button-primary" href="/dashboard/admin/users">Manage account approvals <span>↗</span></a>
  </div></DashboardPage>;
}
