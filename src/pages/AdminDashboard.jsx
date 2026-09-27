import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

const money = (value) => `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState({ statuses: {} });
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [clock, setClock] = useState(Date.now());

  async function load() {
    try {
      const { data: overview, error } = await supabase.rpc('get_admin_overview');
      if (error) throw error;
      setStats(overview.stats || {});
      setAnalytics(overview.analytics || { statuses: {} });
      setLastUpdatedAt(Date.now());
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function loadHealth() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error('Admin session is unavailable.');

      const response = await fetch(`${API_BASE}/backend/health_api.php`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Health check failed.');
      setHealth(result);
      setHealthError('');
    } catch (error) {
      setHealthError(error.message || 'Health check failed.');
    }
  }

  function refreshAll() {
    load();
    loadHealth();
  }

  useEffect(() => {
    load();
    loadHealth();
    const dashboardTimer = setInterval(load, 60000);
    const healthTimer = setInterval(loadHealth, 60000);
    const clockTimer = setInterval(() => setClock(Date.now()), 30000);
    const channel = supabase
      .channel('admin-finance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe();
    return () => {
        clearInterval(dashboardTimer);
      clearInterval(healthTimer);
      clearInterval(clockTimer);
      supabase.removeChannel(channel);
    };
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

  const ageMs = lastUpdatedAt === null ? null : Math.max(0, clock - lastUpdatedAt);
  const stale = ageMs !== null && ageMs > 5 * 60 * 1000;
  const updatedLabel = ageMs === null
    ? 'Waiting for first successful refresh'
    : ageMs < 60000
      ? 'Updated just now'
      : `Updated ${Math.floor(ageMs / 60000)}m ago`;
  const serviceRows = [
    ['Backend API', health?.services?.backend?.status || (healthError ? 'error' : 'checking'), healthError || 'Health endpoint responding'],
    ['Supabase database', health?.services?.database?.status || (healthError ? 'error' : 'checking'), health?.services?.database?.error || 'Admin data query service'],
    ['Image storage', health?.services?.storage?.status || (healthError ? 'error' : 'checking'), health?.services?.storage?.error || 'ai-visualizations bucket'],
    ['NanoBanana provider', health?.services?.image_provider?.status || (healthError ? 'error' : 'checking'), health?.services?.image_provider?.status === 'configured' ? 'Key configured; generation is not called by this check' : 'Provider key is not configured'],
    ['Image failure log', health?.services?.error_log?.status || (healthError ? 'error' : 'checking'), health?.services?.error_log?.status === 'unavailable' ? 'Run the system health SQL migration' : 'Persistent image failure logging'],
  ];

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
          <button className="admin-refresh" onClick={refreshAll} type="button">Refresh data</button>
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

        <section className="system-health-panel" aria-labelledby="system-health-title">
          <div className="system-health-heading">
            <div>
              <p className="eyebrow">Operational status</p>
              <h3 id="system-health-title">System health</h3>
            </div>
            <span className={`data-freshness ${stale ? 'is-stale' : ''}`}>
              {stale ? 'Stale data' : updatedLabel}
            </span>
          </div>

          <div className="system-health-services">
            {serviceRows.map(([label, serviceStatus, detail]) => (
              <div className="system-health-service" key={label}>
                <span className={`health-indicator health-${serviceStatus}`} aria-hidden="true" />
                <div className="system-health-service-copy">
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
                <span className={`health-status-text health-text-${serviceStatus}`}>
                  {serviceStatus === 'healthy' ? 'Healthy' : serviceStatus === 'configured' ? 'Configured' : serviceStatus === 'not_configured' ? 'Not configured' : serviceStatus === 'checking' ? 'Checking' : serviceStatus === 'unavailable' ? 'Unavailable' : 'Error'}
                </span>
              </div>
            ))}
          </div>

          <div className="system-health-events">
            <div className="system-health-events-heading">
              <h4>Recent image-generation failures</h4>
              <span>{health?.recent_image_errors?.length || 0}</span>
            </div>
            {healthError ? (
              <p className="health-empty">Health check unavailable: {healthError}</p>
            ) : health?.services?.error_log?.status === 'unavailable' ? (
              <p className="health-empty">Run the system health migration to enable failure history.</p>
            ) : health?.recent_image_errors?.length ? (
              <div className="health-event-list">
                {health.recent_image_errors.slice(0, 5).map((event) => (
                  <article className="health-event" key={event.id}>
                    <div><strong>{event.message}</strong><small>{event.component === 'image_provider' ? 'Image provider' : 'Image storage'}</small></div>
                    <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="health-empty">No image-generation failures recorded.</p>
            )}
          </div>
        </section>

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
              <span>Platform commission</span>
              <strong>{money(analytics.platform_commission)}</strong>
              <small>2.5% admin earnings</small>
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
