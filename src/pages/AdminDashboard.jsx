import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

const money = (value) => `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState({ statuses: {} });
  const [status, setStatus] = useState('');

  async function load() {
    try {
      const { data: overview, error } = await supabase.rpc('get_admin_overview');
      if (error) throw error;
      setStats(overview.stats || {});
      setAnalytics(overview.analytics || { statuses: {} });
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pendingCount = Number(stats.pending || 0) + Number(stats.customer_pending || 0);
  const statusRows = useMemo(() => {
    const statuses = analytics.statuses || {};
    const total = Object.values(statuses).reduce((sum, value) => sum + Number(value), 0) || 1;
    return [
      ['Confirmed', statuses.confirmed || 0, 'confirmed'],
      ['Pending', statuses.pending || 0, 'pending'],
      ['Completed', statuses.completed || 0, 'completed'],
      ['Cancelled', statuses.cancelled || 0, 'cancelled'],
    ].map(([label, value, key]) => ({ label, value: Number(value), key, percentage: Math.round((Number(value) / total) * 100) }));
  }, [analytics.statuses]);

  return (
    <DashboardPage role="admin">
      <div className="admin-workspace">
        {status && <p className="form-alert error-alert">{status}</p>}

        <div className="admin-intro">
          <div>
            <p className="eyebrow">Operations center</p>
            <h2>Keep CaterAI moving.</h2>
            <p>Review accounts, monitor payouts, and handle the actions that need your attention.</p>
          </div>
          <button className="admin-refresh" onClick={load} type="button">Refresh data</button>
        </div>

        <div className="admin-stats">
          {[
            ['Caterers', stats.caterers, 'Registered partners'],
            ['Verified', stats.verified, 'Approved caterers'],
            ['Customers', stats.customers, 'Registered customers'],
            ['Needs review', pendingCount, 'Accounts waiting'],
          ].map(([label, value, hint]) => (
            <article className="admin-stat" key={label}>
              <span>{label}</span>
              <strong>{value ?? 0}</strong>
              <small>{hint}</small>
            </article>
          ))}
        </div>

        <section className="admin-analytics">
          <div className="admin-analytics-heading">
            <div>
              <p className="eyebrow">Platform insights</p>
              <h3>Analytics overview</h3>
            </div>
            <span>Live database summary</span>
          </div>

          <div className="analytics-metrics">
            <article>
              <span>Total bookings</span>
              <strong>{analytics.bookings || 0}</strong>
              <small>Excluding cancelled requests</small>
            </article>
            <article>
              <span>Collected revenue</span>
              <strong>{money(analytics.revenue)}</strong>
              <small>{analytics.completed_payments || 0} completed payments</small>
            </article>
            <article>
              <span>Average booking</span>
              <strong>{money(analytics.average_booking)}</strong>
              <small>Across active bookings</small>
            </article>
          </div>

          <div className="analytics-status-panel">
            <div className="analytics-status-title">
              <h4>Reservation status</h4>
              <span>{analytics.bookings || 0} active records</span>
            </div>
            <div className="analytics-status-list">
              {statusRows.map((row) => (
                <div className="analytics-status-row" key={row.key}>
                  <div className="analytics-status-label"><span>{row.label}</span><strong>{row.value}</strong></div>
                  <div className="analytics-bar"><span className={`analytics-bar-fill analytics-bar-${row.key}`} style={{ width: `${row.percentage}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <a className="button button-primary" href="/dashboard/admin/users">Manage account approvals <span>↗</span></a>
      </div>
    </DashboardPage>
  );
}
