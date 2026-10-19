import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

const reservationsPerPage = 4;
const historyReservationsPerPage = 8;

function eventIsTodayOrPast(eventDate) {
  const date = new Date(`${eventDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date <= today;
}

function formatCurrency(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatEventDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventTime(eventDate, eventTime) {
  if (!eventTime) return 'Time not set';
  const date = new Date(`${eventDate}T${eventTime}`);
  return Number.isNaN(date.getTime())
    ? eventTime
    : date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [rejectingReservation, setRejectingReservation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_caterer_reservations');
      if (error) throw error;
      const rows = data || [];
      setReservations(rows);
      const { data: profiles } = await supabase.rpc('get_my_profile');
      const catererId = profiles?.[0]?.caterer_id;
      if (catererId) {
        const maxId = rows.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0);
        localStorage.setItem(`caterai-caterer-last-seen-reservation-${catererId}`, String(maxId));
        window.dispatchEvent(new Event('caterer-reservations-seen'));
      }
      setStatus('');
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  async function accept(id) { try { const { error } = await supabase.rpc('accept_caterer_reservation', { reservation_id: id }); if (error) throw error; setStatus('Reservation accepted.'); await load(); } catch (error) { setStatus(error.message); } }
  async function complete(id) {
    if (!window.confirm('Mark this catering event as completed? The customer will be able to leave a review.')) return;
    try {
      const { error } = await supabase.rpc('complete_caterer_reservation', { p_reservation_id: id });
      if (error) throw error;
      await load();
      setStatus('Event marked as completed. The customer can now leave a review.');
    } catch (error) { setStatus(error.message); }
  }
  async function dismissCancelled(id) {
    if (!window.confirm('Remove this unpaid cancelled booking from your reservations list?')) return;
    try {
      const { error } = await supabase.rpc('dismiss_caterer_cancelled_reservation', { p_reservation_id: id });
      if (error) throw error;
      await load();
      setStatus('Cancelled booking removed from your list.');
    } catch (error) { setStatus(error.message); }
  }
  async function submitRejection(event) {
    event.preventDefault();
    if (!rejectingReservation) return;
    const reason = rejectionReason.trim();
    if (reason.length < 5) { setStatus('Please enter a reason of at least 5 characters.'); return; }
    try {
      const { error } = await supabase.rpc('reject_caterer_reservation', { p_reservation_id: rejectingReservation.id, p_rejection_reason: reason });
      if (error) throw error;
      setRejectingReservation(null);
      setRejectionReason('');
      await load();
      setStatus('Reservation rejected. The customer can now see the reason.');
    } catch (error) { setStatus(error.message); }
  }
  const completedReservations = reservations.filter((item) => item.reservation_status === 'completed');
  const pendingReservations = reservations.filter((item) => item.reservation_status === 'pending');
  const visibleReservations = reservations.filter((item) => (
    (item.reservation_status === 'completed') === showHistory
  ));
  const pageSize = showHistory ? historyReservationsPerPage : reservationsPerPage;
  const pageCount = Math.max(1, Math.ceil(visibleReservations.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedReservations = visibleReservations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return (
    <DashboardPage role="caterer" section="reservations">
      <>
        {status && <p className="form-alert success-alert">{status}</p>}
        <div className="analytics-status-title caterer-reservations-heading">
          <h2>{showHistory ? 'Reservation history' : 'Active reservations'}</h2>
          <button className="button button-secondary button-small" onClick={() => { setShowHistory((show) => !show); setPage(1); }} type="button" aria-pressed={showHistory}>
            {showHistory ? 'Back to reservations' : `History (${completedReservations.length})`}
          </button>
        </div>
        <section className="caterer-reservation-summary" aria-label="Reservation summary">
          <article>
            <span>All bookings</span>
            <strong>{reservations.length}</strong>
            <small>Across your account</small>
          </article>
          <article>
            <span>Pending</span>
            <strong>{pendingReservations.length}</strong>
            <small>Waiting for your review</small>
          </article>
          <article>
            <span>Completed</span>
            <strong>{completedReservations.length}</strong>
            <small>Available in history</small>
          </article>
        </section>
        {showHistory ? (
          pagedReservations.length ? (
            <>
              <p className="caterer-history-scroll-hint">Scroll horizontally to see all reservation details.</p>
              <div className="caterer-reservation-history-wrap" role="region" aria-label="Completed reservation history" tabIndex="0">
                <table className="caterer-reservation-history-table" aria-label="Completed reservations">
                  <thead>
                    <tr>
                      <th scope="col">Package</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Event date</th>
                      <th scope="col">Guests</th>
                      <th scope="col">Venue</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReservations.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.package_name || 'Catering package'}</strong></td>
                        <td>{item.customer_name || 'Customer'}</td>
                        <td>
                          <strong>{formatEventDate(item.event_date)}</strong>
                          <span className="caterer-history-time">{formatEventTime(item.event_date, item.event_time)}</span>
                        </td>
                        <td>{Number(item.guest_count || 0).toLocaleString('en-PH')}</td>
                        <td className="caterer-history-venue" title={item.location || ''}>{item.location || 'Not provided'}</td>
                        <td><span className={`caterer-history-payment caterer-history-payment-${item.payment_status || 'pending'}`}>{item.payment_status || 'pending'}</span></td>
                        <td><strong>{formatCurrency(item.total_amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="caterer-history-empty">
              <h3>No completed reservations yet</h3>
              <p>Completed bookings will appear here for easy reference.</p>
            </div>
          )
        ) : (
          pagedReservations.length ? (
            <>
              <p className="caterer-active-scroll-hint">Scroll horizontally to see all reservation details.</p>
              <div className="caterer-reservation-history-wrap caterer-active-reservations-wrap" role="region" aria-label="Active reservations" tabIndex="0">
                <table className="caterer-reservation-history-table caterer-active-reservations-table" aria-label="Active reservations">
                  <thead>
                    <tr>
                      <th scope="col">Package / status</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Event date</th>
                      <th scope="col">Guests</th>
                      <th scope="col">Venue</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Total</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReservations.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.package_name || 'Catering package'}</strong>
                          <span className={`caterer-history-payment caterer-history-payment-${item.reservation_status || 'pending'}`}>
                            {item.reservation_status || 'pending'}
                          </span>
                        </td>
                        <td>{item.customer_name || 'Customer'}</td>
                        <td>
                          <strong>{formatEventDate(item.event_date)}</strong>
                          <span className="caterer-history-time">{formatEventTime(item.event_date, item.event_time)}</span>
                        </td>
                        <td>{Number(item.guest_count || 0).toLocaleString('en-PH')}</td>
                        <td className="caterer-history-venue" title={item.location || ''}>{item.location || 'Not provided'}</td>
                        <td>
                          <span className={`caterer-history-payment caterer-history-payment-${item.payment_status || 'pending'}`}>
                            {item.payment_status || 'pending'}
                          </span>
                          <span className="caterer-history-time">Down payment: {formatCurrency(item.advance_payment)}</span>
                          <span className="caterer-history-time">Balance: {formatCurrency(item.payment_status === 'completed' ? 0 : item.balance_amount)}</span>
                        </td>
                        <td><strong>{formatCurrency(item.total_amount)}</strong></td>
                        <td>
                          <div className="caterer-reservation-row-action">
                            {item.reservation_status === 'pending' && item.payment_status === 'partial' ? (
                              <button className="button button-primary button-small" onClick={() => accept(item.id)} type="button">Accept</button>
                            ) : item.reservation_status === 'pending' && item.payment_status === 'pending' ? (
                              <button className="button reservation-reject-button button-small" onClick={() => { setRejectingReservation(item); setRejectionReason(''); setStatus(''); }} type="button"><X size={15} aria-hidden="true" /> Reject</button>
                            ) : item.reservation_status === 'confirmed' && item.payment_status === 'completed' && eventIsTodayOrPast(item.event_date) ? (
                              <button className="button button-primary button-small" onClick={() => complete(item.id)} type="button"><CheckCircle2 size={15} aria-hidden="true" /> Done</button>
                            ) : item.reservation_status === 'confirmed' && eventIsTodayOrPast(item.event_date) && item.payment_status !== 'completed' ? (
                              <span className="muted-label">Awaiting full payment</span>
                            ) : item.reservation_status === 'cancelled' && item.payment_status === 'pending' ? (
                              <button className="button reservation-dismiss-button" onClick={() => dismissCancelled(item.id)} type="button" title="Remove unpaid cancelled booking" aria-label="Remove unpaid cancelled booking"><X size={16} aria-hidden="true" /></button>
                            ) : (
                              <button className="button button-primary button-small" disabled type="button">{item.reservation_status}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="caterer-history-empty">
              <h3>No active reservations</h3>
              <p>New booking requests and upcoming events will appear here.</p>
            </div>
          )
        )}
        {visibleReservations.length > pageSize && (
          <div className="analytics-status-title caterer-reservation-pagination" aria-label="Reservation pages">
            <span className="caterer-reservation-pagination-range">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleReservations.length)} of {visibleReservations.length}</span>
            <div className="caterer-reservation-pagination-controls">
              <button className="button button-secondary button-small" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
              <span aria-live="polite">Page {currentPage} of {pageCount}</span>
              <button className="button button-secondary button-small" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button>
            </div>
          </div>
        )}
        {rejectingReservation && (
          <div className="reservation-reject-overlay" role="dialog" aria-modal="true" aria-label="Reject booking request" onClick={() => setRejectingReservation(null)}>
            <form className="reservation-reject-form" onSubmit={submitRejection} onClick={(event) => event.stopPropagation()}>
              <header>
                <div><p className="eyebrow eyebrow-soft">Reject booking</p><h2>{rejectingReservation.package_name}</h2><p>Customer: {rejectingReservation.customer_name}</p></div>
                <button className="payment-receipt-close" onClick={() => setRejectingReservation(null)} type="button" aria-label="Close rejection form"><X size={18} /></button>
              </header>
              <label htmlFor="reservation-rejection-reason">Reason shown to customer</label>
              <textarea id="reservation-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} minLength={5} required placeholder="Explain why this unpaid booking cannot be accepted." />
              <div className="reservation-reject-footer">
                <span>{rejectionReason.trim().length}/500</span>
                <button className="button button-secondary" onClick={() => setRejectingReservation(null)} type="button">Cancel</button>
                <button className="button reservation-reject-button" disabled={rejectionReason.trim().length < 5} type="submit">Reject booking</button>
              </div>
            </form>
          </div>
        )}
      </>
    </DashboardPage>
  );
}
