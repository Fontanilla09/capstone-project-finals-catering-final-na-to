import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, CalendarClock, CircleDollarSign, Printer, ReceiptText, X } from 'lucide-react';
import { requestJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function statusClass(status) {
  return `status-pill status-${status}`;
}

function canReview(item) {
  return Number(item.paid_amount) >= Number(item.total_amount) &&
    (item.reservation_status === 'completed' || new Date(`${item.event_date}T23:59:59`) < new Date());
}

export default function CustomerDashboard() {
  const notificationRoute = new URLSearchParams(window.location.search).get('notifications') === '1';
  const [customer, setCustomer] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [statusAlerts, setStatusAlerts] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(notificationRoute);
  const [status, setStatus] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [payingBalanceId, setPayingBalanceId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const statusSnapshotRef = useRef(null);

  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_customer_dashboard');
      if (error) throw error;

      const dashboardReservations = data?.reservations || [];
      setCustomer(data?.customer || null);
      setReservations(dashboardReservations);

      const customerId = data?.customer?.id;
      if (customerId) {
        const storageKey = `caterai-reservation-statuses-${customerId}`;
        const alertsKey = `caterai-reservation-notifications-${customerId}`;
        const unreadKey = `caterai-reservation-notifications-unread-${customerId}`;
        let previousSnapshot = statusSnapshotRef.current?.customerId === customerId
          ? statusSnapshotRef.current.reservations
          : null;
        if (!previousSnapshot) {
          try { previousSnapshot = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { previousSnapshot = null; }
        }
        let savedAlerts = [];
        try { savedAlerts = JSON.parse(localStorage.getItem(alertsKey) || '[]'); } catch { savedAlerts = []; }

        const currentSnapshot = Object.fromEntries(dashboardReservations.map((item) => [String(item.id), {
          reservation_status: item.reservation_status,
          paid_amount: Number(item.paid_amount || 0),
          package_name: item.package_name,
          total_amount: Number(item.total_amount || 0),
        }]));
        if (previousSnapshot) {
          const changes = [];
          for (const item of dashboardReservations) {
            const previous = previousSnapshot[String(item.id)];
            if (!previous) {
              changes.push({
                id: `booking-new-${item.id}`,
                type: 'booking',
                title: 'New booking request',
                message: `${item.package_name} booking is now ${item.reservation_status}.`,
              });
              continue;
            }
            if (previous.reservation_status !== item.reservation_status) {
              changes.push({
                id: `booking-${item.id}-${item.reservation_status}`,
                type: 'booking',
                title: 'Booking status changed',
                message: `${item.package_name} is now ${item.reservation_status}.${item.rejection_reason ? ` Reason: ${item.rejection_reason}` : ''}`,
              });
            } else if (Number(item.paid_amount || 0) > Number(previous.paid_amount || 0)) {
              changes.push({
                id: `payment-${item.id}-${item.paid_amount}`,
                type: 'payment',
                title: 'Payment received',
                message: `${item.package_name}: ₱${Number(item.paid_amount).toLocaleString('en-PH')} paid of ₱${Number(item.total_amount).toLocaleString('en-PH')}.`,
              });
            }
          }
          const freshChanges = changes.filter((notice) => !savedAlerts.some((saved) => saved.id === notice.id));
          const mergedAlerts = [...freshChanges, ...savedAlerts].filter((notice, index, all) => all.findIndex((entry) => entry.id === notice.id) === index).slice(0, 20);
          savedAlerts = mergedAlerts;
          if (freshChanges.length) {
            const previousUnread = Number(localStorage.getItem(unreadKey) || 0);
            localStorage.setItem(unreadKey, String(previousUnread + freshChanges.length));
          }
        }
        setStatusAlerts(savedAlerts);
        try { localStorage.setItem(alertsKey, JSON.stringify(savedAlerts)); } catch { /* Storage may be unavailable. */ }
        statusSnapshotRef.current = { customerId, reservations: currentSnapshot };
        try { localStorage.setItem(storageKey, JSON.stringify(currentSnapshot)); } catch { /* Storage may be unavailable. */ }

        if (notificationRoute) {
          setNotificationsOpen(true);
          localStorage.setItem(unreadKey, '0');
        }
      }

      const query = new URLSearchParams(window.location.search);
      if (query.get('payment') === 'success') {
        const latestPayment = dashboardReservations
          .flatMap((reservation) => (reservation.payments || []).map((payment) => ({ reservation, payment })))
          .sort((first, second) => new Date(second.payment.created_at || second.payment.payment_date || 0) - new Date(first.payment.created_at || first.payment.payment_date || 0))[0];
        if (latestPayment) setReceipt(latestPayment);
      }
      if (query.has('payment') || query.has('notifications')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const refreshWhileVisible = () => {
      if (!document.hidden) load();
    };
    const timer = setInterval(refreshWhileVisible, 60000);
    window.addEventListener('focus', refreshWhileVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshWhileVisible);
    };
  }, []);

  useEffect(() => {
    if (reviewingId) {
      document.getElementById('review-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [reviewingId]);

  useEffect(() => {
    if (!receipt) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setReceipt(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [receipt]);

  async function payBalance(id) {
    if (payingBalanceId !== null) return;
    setPayingBalanceId(id);
    try {
      setStatus('');
      const result = await requestJson('/backend/balance_api.php', {
        method: 'POST',
        body: JSON.stringify({ reservation_id: id }),
      });
      if (!result.approval_url) throw new Error('PayPal did not return a checkout link.');
      window.location.assign(result.approval_url);
    } catch (error) {
      setStatus(error.message);
      setPayingBalanceId(null);
    }
  }

  async function removeRejectedReservation(id) {
    if (!window.confirm('Remove this cancelled booking from your list? The booking record will be kept.')) return;
    try {
      const { error } = await supabase.rpc('dismiss_cancelled_reservation', { p_reservation_id: id });
      if (error) throw error;
      setReservations((current) => current.filter((item) => String(item.id) !== String(id)));
      setStatus('Rejected booking removed from your list.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function dismissStatusAlert(id) {
    const customerId = customer?.id;
    setStatusAlerts((current) => {
      const next = current.filter((item) => item.id !== id);
      if (customerId) {
        try { localStorage.setItem(`caterai-reservation-notifications-${customerId}`, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
      }
      return next;
    });
  }

  async function submitReview(event) {
    event.preventDefault();
    try {
      setStatus('Review submission is not yet connected to Supabase.');
      setReviewingId(null);
      setReviewText('');
      setRating(5);
    } catch (error) {
      setStatus(error.message);
    }
  }

  const summary = useMemo(() => ({
    total: reservations.length,
    pending: reservations.filter((item) => item.reservation_status === 'pending').length,
    confirmed: reservations.filter((item) => item.reservation_status === 'confirmed').length,
    paid: reservations.filter((item) => Number(item.paid_amount) >= Number(item.total_amount)).length,
  }), [reservations]);

  const reminders = useMemo(() => reservations.flatMap((item) => {
    const notices = [];
    const paidAmount = Number(item.paid_amount || 0);
    const totalAmount = Number(item.total_amount || 0);
    const remaining = Math.max(0, totalAmount - paidAmount);
    if (item.reservation_status === 'confirmed' && remaining > 0) {
      notices.push({
        id: `balance-${item.id}`,
        type: 'balance',
        title: 'Remaining balance',
        message: `${item.package_name}: ₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remains to be paid.`,
      });
    }

    if (!['cancelled', 'completed'].includes(item.reservation_status) && item.event_date) {
      const eventDate = new Date(`${item.event_date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
      if (!Number.isNaN(daysUntil) && daysUntil >= 0 && daysUntil <= 7) {
        notices.push({
          id: `event-${item.id}`,
          type: 'event',
          title: daysUntil === 0 ? 'Event is today' : `Event in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          message: `${item.package_name} is scheduled for ${item.event_date}${item.event_time ? ` at ${item.event_time}` : ''}.`,
        });
      }
    }
    return notices;
  }), [reservations]);
  const dashboardNotices = [...statusAlerts, ...reminders];

  return (
    <DashboardPage role="customer" section={notificationRoute ? 'notifications' : 'overview'}>
      <div className="customer-dashboard-panel">
        {status && <p className="form-alert success-alert">{status}</p>}

        <div className="customer-summary-row">
          <div className="customer-profile-card">
            <p className="eyebrow eyebrow-soft">Customer overview</p>
            <h2>{customer?.full_name || 'Customer'}</h2>
            <span>{customer?.email || 'No email available'}</span>
          </div>

          <div className="metric-grid" aria-label="Booking summary">
            <article className="metric-card">
              <span>Total bookings</span>
              <strong>{summary.total}</strong>
            </article>
            <article className="metric-card">
              <span>Pending</span>
              <strong>{summary.pending}</strong>
            </article>
            <article className="metric-card">
              <span>Confirmed</span>
              <strong>{summary.confirmed}</strong>
            </article>
          </div>
        </div>

        {notificationsOpen && (
          <section id="customer-notifications-panel" className="customer-notifications" aria-labelledby="customer-notifications-title">
            <header><Bell size={18} aria-hidden="true" /><h3 id="customer-notifications-title">Notifications &amp; reminders</h3></header>
            <ul aria-live="polite">
              {dashboardNotices.length ? dashboardNotices.map((notice) => (
                <li key={notice.id}>
                  {notice.type === 'event' ? <CalendarClock size={18} aria-hidden="true" /> : notice.type === 'balance' || notice.type === 'payment' ? <CircleDollarSign size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
                  <div><strong>{notice.title}</strong><p>{notice.message}</p></div>
                  {['booking', 'payment'].includes(notice.type) && <button className="notification-dismiss" onClick={() => dismissStatusAlert(notice.id)} type="button" aria-label="Dismiss notification"><X size={16} /></button>}
                </li>
              )) : <li className="customer-notifications-empty">You're all caught up. New booking and payment updates will appear here.</li>}
            </ul>
          </section>
        )}

        <div className="table-card">
          <div className="section-header">
            <div>
              <p className="eyebrow eyebrow-soft">Booking requests</p>
              <h3>Upcoming reservations</h3>
            </div>
          </div>

          <div className="table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Caterer</th>
                  <th>Date</th>
                  <th>Guests</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length ? reservations.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Package"><strong>{item.package_name}</strong></td>
                    <td data-label="Caterer">{item.business_name}</td>
                    <td data-label="Date">{item.event_date}</td>
                    <td data-label="Guests">{item.guest_count}</td>
                    <td data-label="Payment">
                      <div>₱{Number(item.paid_amount).toLocaleString()} / ₱{Number(item.total_amount).toLocaleString()}</div>
                      {(item.payments || []).map((payment, index) => (
                        <button className="button button-secondary button-small payment-receipt-link" key={payment.transaction_id || payment.order_id || index} onClick={() => setReceipt({ reservation: item, payment })} type="button">
                          <ReceiptText size={14} aria-hidden="true" /> {payment.payment_type === 'balance' ? 'Balance receipt' : 'Payment receipt'}
                        </button>
                      ))}
                    </td>
                    <td data-label="Status">
                      <span className={statusClass(item.reservation_status)}>{item.reservation_status}</span>
                      {item.rejection_reason && <p className="reservation-rejection-reason"><strong>Reason from caterer:</strong> {item.rejection_reason}</p>}
                    </td>
                    <td data-label="Action">
                      {item.reservation_status === 'cancelled' ? (
                        <button className="button reservation-dismiss-button" onClick={() => removeRejectedReservation(item.id)} type="button" title="Remove cancelled booking" aria-label="Remove cancelled booking"><X size={16} aria-hidden="true" /></button>
                      ) : item.review_rating ? (
                        <span className="reviewed-label">★ {item.review_rating} rated</span>
                      ) : canReview(item) ? (
                        <button className="button button-primary button-small" onClick={() => setReviewingId(item.id)} type="button">Rate caterer</button>
                      ) : item.reservation_status === 'confirmed' && Number(item.paid_amount) >= Number(item.total_amount) ? (
                        <span className="muted-label">Event upcoming</span>
                      ) : item.reservation_status === 'confirmed' && Number(item.paid_amount) < Number(item.total_amount) ? (
                        <button className="button button-primary button-small" disabled={payingBalanceId !== null} onClick={() => payBalance(item.id)} type="button">{payingBalanceId === item.id ? 'Opening PayPal...' : 'Pay balance'}</button>
                      ) : (
                        <span className="muted-label">Awaiting</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <div className="customer-empty-state">
                        <p>No booking requests yet.</p>
                        <a className="button button-primary" href="/packages">Explore caterers <ArrowRight size={16} aria-hidden="true" /></a>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {reviewingId && (
          <form id="review-form" className="review-form" onSubmit={submitReview}>
            <h3>Rate your catering experience</h3>
            <p>Share your final impression of the service.</p>

            <label>
              Rating
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </label>

            <label>
              Review
              <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Tell us about your event experience..." />
            </label>

            <div className="review-actions">
              <button className="button button-primary" type="submit">Submit review</button>
              <button className="button button-secondary" onClick={() => setReviewingId(null)} type="button">Cancel</button>
            </div>
          </form>
        )}

        {receipt && (
          <div className="payment-receipt-overlay" role="dialog" aria-modal="true" aria-label="PayPal payment receipt" onClick={() => setReceipt(null)}>
            <article className="payment-receipt" onClick={(event) => event.stopPropagation()}>
              <header className="payment-receipt-header">
                <div>
                  <p className="eyebrow eyebrow-soft">CaterAI · Payment receipt</p>
                  <h2>Payment confirmed</h2>
                </div>
                <button className="payment-receipt-close" onClick={() => setReceipt(null)} type="button" aria-label="Close receipt"><X size={18} /></button>
              </header>
              <p className="payment-receipt-note">Paid securely through PayPal.</p>
              <dl className="payment-receipt-details">
                <dt>Package</dt><dd>{receipt.reservation.package_name}</dd>
                <dt>Payment type</dt><dd>{receipt.payment.payment_type === 'balance' ? 'Balance payment' : 'Down payment'}</dd>
                <dt>Amount paid</dt><dd>₱{Number(receipt.payment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                <dt>Payment date</dt><dd>{receipt.payment.payment_date || 'Not available'}</dd>
                <dt>Paid to PayPal account</dt><dd>{receipt.payment.payee_email || 'Recipient not stored for this payment'}</dd>
                <dt>PayPal transaction ID</dt><dd className="payment-receipt-id">{receipt.payment.transaction_id || 'Not available'}</dd>
                <dt>PayPal order ID</dt><dd className="payment-receipt-id">{receipt.payment.order_id || 'Not available'}</dd>
                <dt>Payer</dt><dd>{receipt.payment.payer_name || receipt.payment.payer_email || 'Not available'}</dd>
              </dl>
              <div className="payment-receipt-actions">
                <button className="button button-primary" onClick={() => window.print()} type="button"><Printer size={16} aria-hidden="true" /> Print receipt</button>
              </div>
            </article>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
