import { useEffect, useState } from 'react';
import { Activity, CalendarCheck2, CalendarDays, Clock3, MessageSquareText, Package, Star, UsersRound, WalletCards } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function getEventDate(value) {
  return new Date(`${value}T00:00:00`);
}

function formatEventTime(eventDate, eventTime) {
  if (!eventTime) return 'Time not set';
  const dateTime = new Date(`${eventDate}T${eventTime}`);
  if (Number.isNaN(dateTime.getTime())) return eventTime;
  return dateTime.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function formatActivityDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function getRecentActivity(reservations, payouts, reviews) {
  const activity = [
    ...reservations
      .filter((item) => item.reservation_status === 'completed')
      .map((item) => ({
        id: `reservation-${item.id}`,
        date: getEventDate(item.event_date),
        title: 'Reservation completed',
        detail: item.package_name || 'Catering event',
        icon: CalendarCheck2,
      })),
    ...payouts
      .filter((item) => item.payout_status === 'paid' && item.paid_at)
      .map((item) => ({
        id: `payout-${item.id}`,
        date: new Date(item.paid_at),
        title: `Payout of ${money(item.caterer_amount)} sent`,
        detail: item.package_name || 'PayPal payout',
        icon: WalletCards,
      })),
    ...reviews.map((item) => ({
      id: `review-${item.review_id}`,
      date: new Date(item.created_at),
      title: `New ${Number(item.rating) || 0}-star review received`,
      detail: item.customer_name || 'Customer feedback',
      icon: MessageSquareText,
    })),
  ];

  return activity
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((first, second) => second.date - first.date)
    .slice(0, 4);
}

function getMonthlyEarnings(payouts) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString('en-PH', { month: 'short' }),
      value: 0,
    };
  });
  const monthTotals = new Map(months.map((month) => [month.key, month]));

  payouts.forEach((payout) => {
    if (!payout.event_date) return;
    const eventDate = getEventDate(payout.event_date);
    if (Number.isNaN(eventDate.getTime())) return;
    const key = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
    const month = monthTotals.get(key);
    if (month) month.value += Number(payout.caterer_amount) || 0;
  });

  return months;
}

const emptyStats = {
  packages: 0,
  reservations: 0,
  upcoming: 0,
  rating: '0.00',
  analytics: {
    total_earnings: 0,
    paid_out: 0,
    pending_payout: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
  },
};

export default function CatererDashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [reservations, setReservations] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');
  const [activeReservationStatus, setActiveReservationStatus] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data: profileData, error: profileError } = await supabase.rpc('get_my_profile');
        if (profileError) throw profileError;
        const profile = profileData?.[0];
        if (!profile?.caterer_id) throw new Error('Caterer profile not found.');

        const [
          { count: packageCount },
          { data: catererData, error: catererError },
          { data, error: reservationsError },
          { data: earningsData, error: earningsError },
          { data: reviewsData, error: reviewsError },
        ] = await Promise.all([
          supabase.from('packages').select('id', { count: 'exact', head: true }).eq('caterer_id', profile.caterer_id),
          supabase.from('caterers').select('rating').eq('id', profile.caterer_id).maybeSingle(),
          supabase.rpc('get_caterer_reservations'),
          supabase.rpc('get_caterer_earnings'),
          supabase.rpc('get_caterer_reviews'),
        ]);

        if (catererError) throw catererError;
        if (reservationsError) throw reservationsError;
        if (earningsError) throw earningsError;
        if (reviewsError) throw reviewsError;

        const reservations = data || [];
        const earningsSummary = earningsData?.summary || {};
        const payoutRows = earningsData?.payouts || [];
        const reviewRows = reviewsData || [];
        const reviewAverage = reviewRows.length
          ? reviewRows.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviewRows.length
          : Number(catererData?.rating || 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pending = reservations.filter((item) => item.reservation_status === 'pending').length;
        const confirmed = reservations.filter((item) => item.reservation_status === 'confirmed').length;
        const completed = reservations.filter((item) => item.reservation_status === 'completed').length;
        const cancelled = reservations.filter((item) => item.reservation_status === 'cancelled').length;
        const upcomingReservations = reservations
          .filter((item) => item.reservation_status === 'confirmed' && getEventDate(item.event_date) >= today)
          .sort((a, b) => {
            const dateDifference = getEventDate(a.event_date) - getEventDate(b.event_date);
            return dateDifference || String(a.event_time || '').localeCompare(String(b.event_time || ''));
          });
        const upcomingEvents = upcomingReservations.slice(0, 3);

        if (active) {
          setReservations(reservations);
          setUpcomingEvents(upcomingEvents);
          setPayouts(payoutRows);
          setReviews(reviewRows);
          setStats({
            packages: Number(packageCount || 0),
            reservations: reservations.filter((item) => ['pending', 'confirmed'].includes(item.reservation_status)).length,
            upcoming: upcomingReservations.length,
            rating: reviewAverage.toFixed(2),
            analytics: {
              total_earnings: Number(earningsSummary.total || 0),
              paid_out: Number(earningsSummary.paid || 0),
              pending_payout: Number(earningsSummary.pending || 0),
              pending,
              confirmed,
              completed,
              cancelled,
            },
          });
          setError('');
        }
      } catch (reason) {
        if (active) {
          setStats(emptyStats);
          setReservations([]);
          setUpcomingEvents([]);
          setPayouts([]);
          setReviews([]);
          setError(reason?.message || 'Could not load caterer dashboard data.');
        }
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const reservationStatusRows = [
    { label: 'Confirmed', value: stats.analytics.confirmed, color: 'var(--chart-1)' },
    { label: 'Pending', value: stats.analytics.pending, color: 'var(--chart-2)' },
    { label: 'Completed', value: stats.analytics.completed, color: 'var(--chart-3)' },
    { label: 'Cancelled', value: stats.analytics.cancelled, color: 'var(--chart-4)' },
  ];
  const reservationTotal = reservationStatusRows.reduce((sum, row) => sum + row.value, 0);
  const reservationCircumference = 2 * Math.PI * 44;
  let reservationOffset = 0;
  const reservationChartRows = reservationStatusRows.map((row) => {
    const segmentLength = reservationTotal ? (row.value / reservationTotal) * reservationCircumference : 0;
    const chartRow = {
      ...row,
      percentage: reservationTotal ? Math.round((row.value / reservationTotal) * 1000) / 10 : 0,
      dashLength: Math.max(segmentLength - 14, 0),
      offset: -reservationOffset,
    };
    reservationOffset += segmentLength;
    return chartRow;
  });
  const activeRow = reservationChartRows.find((row) => row.label === activeReservationStatus);
  const monthlyEarnings = getMonthlyEarnings(payouts);
  const recentActivity = getRecentActivity(reservations, payouts, reviews);
  const chartMax = Math.max(...monthlyEarnings.map((month) => month.value), 1);
  const chartPoints = monthlyEarnings.map((month, index) => ({
    ...month,
    x: 26 + (index * 348) / Math.max(monthlyEarnings.length - 1, 1),
    y: 126 - (month.value / chartMax) * 102,
  }));
  const chartAxisLabel = (value) => value >= 1000
    ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : money(value);
  const earningsChartKey = chartPoints.map((point) => `${point.key}:${point.value}`).join('|');
  const earningsLinePath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const earningsAreaPath = `${earningsLinePath} L ${chartPoints.at(-1)?.x || 374} 132 L ${chartPoints[0]?.x || 26} 132 Z`;
  const paidPercentage = stats.analytics.total_earnings
    ? Math.min((stats.analytics.paid_out / stats.analytics.total_earnings) * 100, 100)
    : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Number(review.rating) === rating).length,
  }));

  return (
    <DashboardPage role="caterer">
      <>
        {error && <p className="form-alert error-alert">{error}</p>}
        <div className="stats-grid">
          <article className="stat-card stat-card-packages">
            <div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true"><Package size={17} /></span><h3>Packages</h3></div>
            <strong>{stats.packages}</strong>
            <small>Available on your profile</small>
          </article>
          <article className="stat-card stat-card-reservations">
            <div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true"><CalendarCheck2 size={17} /></span><h3>Active reservations</h3></div>
            <strong>{stats.reservations}</strong>
            <small>Pending and confirmed bookings</small>
          </article>
          <article className="stat-card stat-card-upcoming">
            <div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true"><CalendarDays size={17} /></span><h3>Upcoming events</h3></div>
            <strong>{stats.upcoming}</strong>
            <small>Confirmed future events</small>
          </article>
          <article className="stat-card stat-card-rating">
            <div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true"><Star size={17} /></span><h3>Average rating</h3></div>
            <strong>{stats.rating}</strong>
            <small>Customer feedback</small>
          </article>
        </div>
        <section className="caterer-analytics">
          <div className="caterer-dashboard-main-grid">
            <section className="caterer-dashboard-panel caterer-earnings-trend" aria-labelledby="caterer-earnings-trend-title">
              <div className="caterer-dashboard-panel-heading">
                <div><h3 id="caterer-earnings-trend-title">Earnings trend</h3><p>Net earnings by event date</p></div>
                <span>Last 6 months</span>
              </div>
              <svg key={earningsChartKey} className="caterer-earnings-chart" viewBox="0 0 400 170" role="img" aria-label={`Monthly net earnings for the last six months: ${monthlyEarnings.map((month) => `${month.label} ${money(month.value)}`).join(', ')}`}>
                <defs>
                  <linearGradient id="caterer-earnings-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity=".24" />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity=".02" />
                  </linearGradient>
                </defs>
                {[24, 75, 126].map((y) => <line className="caterer-earnings-gridline" key={y} x1="26" x2="374" y1={y} y2={y} />)}
                <text className="caterer-earnings-axis-label" x="22" y="27" textAnchor="end">{chartAxisLabel(chartMax)}</text>
                <text className="caterer-earnings-axis-label" x="22" y="78" textAnchor="end">{chartAxisLabel(chartMax / 2)}</text>
                <text className="caterer-earnings-axis-label" x="22" y="129" textAnchor="end">₱0</text>
                <path className="caterer-earnings-area" d={earningsAreaPath} />
                <path className="caterer-earnings-line" d={earningsLinePath} pathLength="1" />
                {chartPoints.map((point, index) => (
                  <g className="caterer-earnings-point" key={point.key} style={{ '--point-delay': `${index * 110}ms` }}>
                    <circle cx={point.x} cy={point.y} r="6" />
                    <title>{point.label}: {money(point.value)}</title>
                  </g>
                ))}
                {chartPoints.map((point) => <text className="caterer-earnings-month" key={`${point.key}-label`} x={point.x} y="153">{point.label}</text>)}
              </svg>
              <div className="caterer-analytics-metrics">
                <article key={`total-${stats.analytics.total_earnings}`}><span>Total earnings</span><strong>{money(stats.analytics.total_earnings)}</strong></article>
                <article key={`paid-${stats.analytics.paid_out}`}><span>Paid out</span><strong>{money(stats.analytics.paid_out)}</strong></article>
                <article key={`pending-${stats.analytics.pending_payout}`}><span>Pending payout</span><strong>{money(stats.analytics.pending_payout)}</strong></article>
              </div>
              <div className="caterer-payout-progress" role="img" aria-label={`${paidPercentage.toFixed(0)} percent of earnings paid out`}>
                <span key={`progress-${paidPercentage.toFixed(2)}`} style={{ width: `${paidPercentage}%` }} />
              </div>
              <p className="caterer-earnings-caption">Net after the 2.5% platform fee · {paidPercentage.toFixed(0)}% paid out</p>
              <details className="chart-data-table">
                <summary>View data as table</summary>
                <div className="chart-data-table-wrap">
                  <table>
                    <thead><tr><th>Month</th><th>Net earnings</th></tr></thead>
                    <tbody>{monthlyEarnings.map((month) => <tr key={month.key}><th scope="row">{month.label}</th><td>{money(month.value)}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </section>
            <section className="caterer-dashboard-panel caterer-booking-chart" aria-labelledby="caterer-booking-chart-title">
              <div className="caterer-dashboard-panel-heading">
                <div><h3 id="caterer-booking-chart-title">Reservations by status</h3><p>{reservationTotal} total reservations</p></div>
                <span>{reservationTotal ? `${reservationChartRows.find((row) => row.label === 'Completed')?.percentage || 0}% completed` : 'No bookings yet'}</span>
              </div>
              <div className="caterer-booking-chart-content">
                <div className="caterer-booking-donut-wrap">
                  <svg className="caterer-booking-donut" viewBox="0 0 100 100" role="img" aria-label={`Reservation breakdown: ${reservationChartRows.map((row) => `${row.label}, ${row.value}, ${row.percentage}%`).join('; ')}`}>
                    <circle className="caterer-booking-donut-track" cx="50" cy="50" r="44" />
                    {reservationChartRows.filter((row) => row.value > 0).map((row) => (
                      <circle
                        className={`caterer-booking-donut-segment${activeReservationStatus === row.label ? ' is-active' : ''}`}
                        cx="50"
                        cy="50"
                        key={row.label}
                        onMouseEnter={() => setActiveReservationStatus(row.label)}
                        onMouseLeave={() => setActiveReservationStatus(null)}
                        r="44"
                        stroke={row.color}
                        strokeDasharray={`${row.dashLength} ${reservationCircumference - row.dashLength}`}
                        strokeDashoffset={row.offset}
                        transform="rotate(-90 50 50)"
                      >
                        <title>{`${row.label}: ${row.value} (${row.percentage}%)`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className="caterer-booking-donut-center" aria-hidden="true">
                    <strong>{activeRow ? activeRow.value : reservationTotal}</strong>
                    <span>{activeRow ? activeRow.label : 'Reservations'}</span>
                    {activeRow && <small>{activeRow.percentage}% of total</small>}
                  </div>
                </div>
                <div className="caterer-booking-chart-legend" role="group" aria-label="Reservation statuses">
                  {reservationChartRows.map((row) => (
                    <button
                      aria-pressed={activeReservationStatus === row.label}
                      className={`caterer-booking-legend-item${activeReservationStatus === row.label ? ' is-active' : ''}`}
                      key={row.label}
                      onBlur={() => setActiveReservationStatus(null)}
                      onFocus={() => setActiveReservationStatus(row.label)}
                      onMouseEnter={() => setActiveReservationStatus(row.label)}
                      onMouseLeave={() => setActiveReservationStatus(null)}
                      onClick={() => setActiveReservationStatus(activeReservationStatus === row.label ? null : row.label)}
                      type="button"
                    >
                      <span className="caterer-booking-legend-dot" style={{ '--status-color': row.color }} />
                      <span className="caterer-booking-legend-label">{row.label}</span>
                      <strong>{row.value}</strong>
                      <small>{row.percentage}%</small>
                    </button>
                  ))}
                </div>
              </div>
              <details className="chart-data-table">
                <summary>View data as table</summary>
                <div className="chart-data-table-wrap">
                  <table>
                    <thead><tr><th>Status</th><th>Reservations</th><th>Share</th></tr></thead>
                    <tbody>{reservationChartRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td><td>{row.percentage}%</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>
          <div className="caterer-dashboard-bottom-grid">
            <section className="caterer-dashboard-panel caterer-rating-breakdown" aria-labelledby="caterer-rating-breakdown-title">
              <div className="caterer-dashboard-panel-heading">
                <div><h3 id="caterer-rating-breakdown-title">Customer ratings</h3><p>{reviews.length} customer reviews</p></div>
                <a href="/dashboard/caterer/reviews">{stats.rating} avg</a>
              </div>
              <div className="caterer-rating-rows">
                {ratingDistribution.map(({ rating, count }) => (
                  <div className="caterer-rating-row" key={rating} aria-label={`${rating} stars: ${count} reviews`}>
                    <span>{rating} <Star size={12} fill="currentColor" aria-hidden="true" /></span>
                    <span className="caterer-rating-track"><span style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }} /></span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="caterer-dashboard-panel caterer-upcoming-events" aria-labelledby="caterer-upcoming-events-title">
              <div className="caterer-upcoming-heading">
                <div><h3 id="caterer-upcoming-events-title">Upcoming events</h3></div>
                <a href="/dashboard/caterer/reservations">View all <span aria-hidden="true">↗</span></a>
              </div>
              {upcomingEvents.length ? (
                <div className="caterer-upcoming-list">
                  {upcomingEvents.map((event) => {
                    const date = getEventDate(event.event_date);
                    return (
                      <article className="caterer-upcoming-event" key={event.id}>
                        <div className="caterer-upcoming-date" aria-label={date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}>
                          <span>{date.toLocaleDateString('en-PH', { month: 'short' })}</span>
                          <strong>{date.getDate()}</strong>
                        </div>
                        <div className="caterer-upcoming-event-main">
                          <h4>{event.package_name || 'Catering event'}</h4>
                          <div className="caterer-upcoming-event-meta">
                            <span><UsersRound size={14} aria-hidden="true" />{event.customer_name || 'Customer'}</span>
                            <span><Clock3 size={14} aria-hidden="true" /><time dateTime={`${event.event_date}T${event.event_time || '00:00:00'}`}>{formatEventTime(event.event_date, event.event_time)}</time></span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="caterer-upcoming-empty">
                  <span className="caterer-upcoming-empty-icon"><CalendarDays size={19} aria-hidden="true" /></span>
                  <div><strong>No upcoming events yet</strong><p>Confirmed bookings will appear here.</p></div>
                </div>
              )}
            </section>
            <section className="caterer-dashboard-panel caterer-recent-activity" aria-labelledby="caterer-recent-activity-title">
              <div className="caterer-dashboard-panel-heading">
                <div><h3 id="caterer-recent-activity-title">Recent activity</h3><p>Your latest business updates</p></div>
              </div>
              {recentActivity.length ? (
                <ul>
                  {recentActivity.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <span className="caterer-activity-icon" aria-hidden="true"><Icon size={14} /></span>
                        <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                        <time dateTime={item.date.toISOString()}>{formatActivityDate(item.date)}</time>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="caterer-activity-empty"><Activity size={18} aria-hidden="true" /><span>New reservations, reviews, and payouts will appear here.</span></div>
              )}
            </section>
          </div>
        </section>
      </>
    </DashboardPage>
  );
}
