import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Building2, ClipboardList, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { API_BASE } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (value) => String(value || '').replace(/\s+\d{2,4}$/, '');

function smoothLinePath(points) {
  if (!points.length) return '';
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middleX = (previous.x + point.x) / 2;
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState({ statuses: {} });
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const [hoveredStatusKey, setHoveredStatusKey] = useState(null);
  const [earningsView, setEarningsView] = useState('chart');

  async function load() {
    try {
      const [overviewResult, subscriptionResult] = await Promise.all([
        supabase.rpc('get_admin_overview'),
        supabase.rpc('get_admin_subscription_earnings'),
      ]);
      if (overviewResult.error) throw overviewResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      const overview = overviewResult.data;
      setStats(overview.stats || {});
      setAnalytics({
        ...(overview.analytics || { statuses: {} }),
        ...(subscriptionResult.data || {}),
      });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caterer_subscriptions' }, load)
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
    const knownStatuses = [
      ['Confirmed', 'confirmed', 'var(--status-confirmed)'],
      ['Pending', 'pending', 'var(--status-pending)'],
      ['Completed', 'completed', 'var(--status-completed)'],
      ['Cancelled', 'cancelled', 'var(--status-cancelled)'],
    ];
    const rows = knownStatuses.map(([label, key, color]) => ({
      label,
      key,
      color,
      value: Number(statuses[key] || 0),
    }));
    const knownKeys = new Set(knownStatuses.map(([, key]) => key));
    Object.entries(statuses)
      .filter(([key]) => !knownKeys.has(key))
      .forEach(([key, value], index) => rows.push({
        label: key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        key,
        color: `var(--chart-${(index % 4) + 1})`,
        value: Number(value || 0),
      }));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return rows.map((row) => ({ ...row, percentage: total ? Math.round((row.value / total) * 100) : 0 }));
  }, [analytics.statuses]);
  const statusTotal = statusRows.reduce((sum, row) => sum + row.value, 0);
  const hoveredStatus = statusRows.find((row) => row.key === hoveredStatusKey);
  const statusChartRows = useMemo(() => {
    const circumference = 2 * Math.PI * 42;
    let offset = 0;
    return statusRows.map((row) => {
      const length = statusTotal ? (row.value / statusTotal) * circumference : 0;
      const segment = { ...row, length, offset: -offset };
      offset += length;
      return segment;
    });
  }, [statusRows, statusTotal]);
  const monthlyEarnings = Array.isArray(analytics.monthly_earnings) ? analytics.monthly_earnings : [];
  const monthlyEarningsMax = Math.max(
    ...monthlyEarnings.map((month) => Number(month.amount) || 0),
    10,
  );
  const earningsAxisMax = Math.max(10, Math.ceil(monthlyEarningsMax / 10) * 10);
  const earningsPoints = monthlyEarnings.map((month, index) => ({
    ...month,
    amount: Number(month.amount) || 0,
    x: 30 + (index * 340) / Math.max(monthlyEarnings.length - 1, 1),
    y: 164 - ((Number(month.amount) || 0) / earningsAxisMax) * 124,
  }));
  const earningsLinePath = smoothLinePath(earningsPoints);
  const earningsAreaPath = earningsPoints.length
    ? `${earningsLinePath} L ${earningsPoints.at(-1).x} 164 L ${earningsPoints[0].x} 164 Z`
    : '';
  const sixMonthEarnings = monthlyEarnings.reduce((sum, month) => sum + (Number(month.amount) || 0), 0);
  const latestEarningsMonth = monthlyEarnings.at(-1);
  const latestMonthSubscribers = Number(latestEarningsMonth?.subscribers) || 0;
  const monthlyEarningsDescription = monthlyEarnings
    .map((month) => `${monthLabel(month.month)}: ${money(month.amount)}`)
    .join(', ');

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
            <p className="eyebrow">Your platform at a glance</p>
            <h2>Admin overview</h2>
            <p>Track bookings, revenue, and the health of your catering community.</p>
          </div>
          <button className="admin-refresh" onClick={refreshAll} type="button"><RefreshCw size={15} /> Refresh data</button>
        </div>

        <div className="admin-stats admin-overview-stats">
          {[
            { label: 'Total bookings', value: analytics.bookings, hint: 'Excluding cancelled requests', Icon: ClipboardList, tone: 'violet' },
            { label: 'Subscription earnings', value: money(analytics.subscription_earnings), hint: `${analytics.paid_subscriptions || 0} paid subscriptions`, Icon: ArrowUpRight, tone: 'blue' },
          ].map(({ label, value, hint, Icon, tone }) => (
            <article className={`admin-stat admin-stat-${tone}`} key={label}>
              <div className="admin-stat-top"><span>{label}</span><i><Icon size={18} /></i></div>
              <strong>{value ?? 0}</strong>
              <small><span className="admin-stat-dot" />{hint}</small>
            </article>
          ))}
        </div>

        <section className="admin-analytics">
          <div className="admin-analytics-heading">
            <div>
              <p className="eyebrow">Performance</p>
              <h3>Platform analytics</h3>
            </div>
            <span className="admin-live-label"><i /> Live database summary</span>
          </div>

          <div className="admin-community-stats">
            <article><i><Building2 size={17} /></i><span>Registered caterers</span><strong>{stats.caterers ?? 0}</strong></article>
            <article><i><ShieldCheck size={17} /></i><span>Verified partners</span><strong>{stats.verified ?? 0}</strong></article>
            <article><i><Users size={17} /></i><span>Customers</span><strong>{stats.customers ?? 0}</strong></article>
            <article className="admin-community-pending"><i><ArrowDownToLine size={17} /></i><span>Needs review</span><strong>{pendingCount}</strong></article>
          </div>

          <div className="admin-chart-grid">
            <section className="admin-chart-panel" aria-labelledby="reservation-chart-title">
              <div className="analytics-status-title">
                <div>
                  <p className="eyebrow">Bookings</p>
                  <h4 id="reservation-chart-title">Reservation status</h4>
                </div>
                <span>{statusTotal} total reservations</span>
              </div>
              <div className="reservation-chart-content">
                <div className="reservation-donut-wrap">
                  <svg className="reservation-donut" viewBox="0 0 100 100" role="img" aria-label={`Reservation status breakdown for ${statusTotal} reservations`}>
                    <circle className="reservation-donut-track" cx="50" cy="50" r="42" />
                    {statusChartRows.map((row) => (
                      <circle
                        className="reservation-donut-segment"
                        cx="50"
                        cy="50"
                        key={row.key}
                        r="42"
                        stroke={row.color}
                        strokeDasharray={`${row.length} ${2 * Math.PI * 42 - row.length}`}
                        strokeDashoffset={row.offset}
                        tabIndex={row.value > 0 ? 0 : -1}
                        role="button"
                        aria-label={`${row.label}: ${row.value} reservations, ${row.percentage}%`}
                        onMouseEnter={() => setHoveredStatusKey(row.key)}
                        onMouseLeave={() => setHoveredStatusKey(null)}
                        onFocus={() => setHoveredStatusKey(row.key)}
                        onBlur={() => setHoveredStatusKey(null)}
                        style={{ '--donut-offset': row.offset }}
                      >
                        <title>{`${row.label}: ${row.value} (${row.percentage}%)`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className={`reservation-donut-total${hoveredStatus ? ' is-hovered' : ''}`} aria-live="polite" aria-atomic="true">
                    <div key={hoveredStatus?.key || 'all'} className="reservation-donut-center-copy">
                      <strong style={hoveredStatus ? { color: hoveredStatus.color } : undefined}>
                        {hoveredStatus ? hoveredStatus.value : statusTotal}
                      </strong>
                      <span>{hoveredStatus ? hoveredStatus.label : 'Bookings'}</span>
                      {hoveredStatus && <small>{hoveredStatus.percentage}% of reservations</small>}
                    </div>
                  </div>
                </div>
                <div className="reservation-chart-legend">
                  {statusRows.map((row) => (
                    <div
                      className={`reservation-chart-legend-row${hoveredStatusKey === row.key ? ' is-active' : ''}`}
                      key={row.key}
                      onMouseEnter={() => setHoveredStatusKey(row.key)}
                      onMouseLeave={() => setHoveredStatusKey(null)}
                      onFocus={() => setHoveredStatusKey(row.key)}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setHoveredStatusKey(null);
                      }}
                      style={{ '--series-color': row.color }}
                      tabIndex={row.value > 0 ? 0 : -1}
                    >
                      <div className="reservation-chart-legend-main">
                        <span className="reservation-chart-legend-label" style={{ '--series-color': row.color }}><i />{row.label}</span>
                        <strong>{row.value}<small>{row.percentage}%</small></strong>
                      </div>
                      <span className="reservation-chart-bar"><i style={{ '--series-color': row.color, width: `${row.percentage}%` }} /></span>
                    </div>
                  ))}
                </div>
              </div>
              <details className="chart-data-table">
                <summary>View data as table</summary>
                <div className="chart-data-table-wrap">
                  <table>
                    <thead><tr><th>Status</th><th>Reservations</th><th>Share</th></tr></thead>
                    <tbody>{statusRows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.value}</td><td>{row.percentage}%</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </section>

            <section className="admin-chart-panel admin-subscription-earnings-panel" aria-labelledby="revenue-chart-title">
              <div className="admin-earnings-heading">
                <div>
                  <h4 id="revenue-chart-title">Subscription earnings</h4>
                  <span>Last 6 months</span>
                </div>
                <div className="admin-earnings-view-toggle" role="group" aria-label="Subscription earnings view">
                  <button aria-pressed={earningsView === 'chart'} className={earningsView === 'chart' ? 'active' : ''} onClick={() => setEarningsView('chart')} type="button">Chart</button>
                  <button aria-pressed={earningsView === 'table'} className={earningsView === 'table' ? 'active' : ''} onClick={() => setEarningsView('table')} type="button">Table</button>
                </div>
              </div>
              <div className="admin-earnings-total">
                <strong>{money(analytics.subscription_earnings)}</strong>
                <span>
                  {latestMonthSubscribers} new subscriber{latestMonthSubscribers === 1 ? '' : 's'} in {monthLabel(latestEarningsMonth?.month) || 'the current month'}
                  {' · '}{money(sixMonthEarnings)} in the last 6 months
                </span>
              </div>
              {earningsView === 'chart' ? monthlyEarnings.length ? (
                <div className="admin-earnings-chart">
                  <svg
                    key={monthlyEarningsDescription}
                    className="admin-earnings-line-chart"
                    viewBox="0 0 400 205"
                    role="img"
                    aria-label={`Monthly subscription earnings for the last six months: ${monthlyEarningsDescription || 'No paid subscriptions'}`}
                  >
                    <defs>
                      <linearGradient id="admin-earnings-area" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity=".24" />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity=".02" />
                      </linearGradient>
                    </defs>
                    {[40, 102, 164].map((y) => (
                      <line className="admin-earnings-gridline" key={y} x1="30" x2="370" y1={y} y2={y} />
                    ))}
                    <text className="admin-earnings-axis-label" x="396" y="36" textAnchor="end">{money(earningsAxisMax)}</text>
                    <text className="admin-earnings-axis-label" x="396" y="98" textAnchor="end">{money(earningsAxisMax / 2)}</text>
                    <text className="admin-earnings-axis-label" x="396" y="160" textAnchor="end">₱0</text>
                    <path className="admin-earnings-area" d={earningsAreaPath} />
                    <path className="admin-earnings-line" d={earningsLinePath} pathLength="1" />
                    {earningsPoints.map((point, index) => (
                      <g className="admin-earnings-point" key={point.month} style={{ '--point-delay': `${500 + index * 100}ms` }}>
                        <circle cx={point.x} cy={point.y} r="3.5" />
                        <title>{`${point.month}: ${money(point.amount)} · ${Number(point.subscribers) || 0} paid subscriptions`}</title>
                      </g>
                    ))}
                    {earningsPoints.map((point) => (
                      <text className="admin-earnings-month" key={`${point.month}-label`} x={point.x} y="190" textAnchor="middle">{monthLabel(point.month)}</text>
                    ))}
                  </svg>
                  <p className="admin-earnings-caption">Your trend will appear here as more caterers subscribe.</p>
                </div>
              ) : (
                <p className="admin-earnings-empty">No paid subscription earnings in the last six months.</p>
              ) : (
                <div className="admin-earnings-table-wrap">
                  <table>
                    <thead><tr><th>Month</th><th>New subscriptions</th><th>Earnings</th></tr></thead>
                    <tbody>{monthlyEarnings.map((month) => (
                      <tr key={month.month}>
                        <th scope="row">{monthLabel(month.month)}</th>
                        <td>{Number(month.subscribers) || 0}</td>
                        <td>{money(month.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {!monthlyEarnings.length && <p className="admin-earnings-empty">No paid subscription earnings in the last six months.</p>}
                </div>
              )}
            </section>
          </div>
        </section>

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
                  {serviceStatus === 'healthy' ? 'Healthy' : serviceStatus === 'configured' ? 'Configured' : serviceStatus === 'not_configured' ? 'Not configured' : serviceStatus === 'checking' ? <span className="loading-spinner loading-spinner-inline" role="status" aria-label="Checking" /> : serviceStatus === 'unavailable' ? 'Unavailable' : 'Error'}
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

        <a className="button button-primary" href="/dashboard/admin/users">Manage account approvals <span>↗</span></a>
      </div>
    </DashboardPage>
  );
}
