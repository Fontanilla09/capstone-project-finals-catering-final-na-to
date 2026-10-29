import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import { formatEventTimeRange } from '../lib/eventTime';

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

function formatPaymentMethod(value) {
  if (!value) return 'Not recorded';
  return value === 'paypal' ? 'PayPal' : value === 'gcash' ? 'GCash' : value;
}

function formatEventDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
  const [cancellationRequests, setCancellationRequests] = useState([]);
  const [reviewingCancellationId, setReviewingCancellationId] = useState(null);
  const [gcashSubmissions, setGcashSubmissions] = useState([]);
  const [reviewingGcashId, setReviewingGcashId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [rejectingReservation, setRejectingReservation] = useState(null);
  const [viewingReservation, setViewingReservation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_caterer_reservations');
      if (error) throw error;
      const rows = (data || []).filter((item) => !(
        item.reservation_status === 'pending' && item.payment_status === 'pending'
      ));
      setReservations(rows);
      const { data: cancellationRows, error: cancellationError } = await supabase.rpc('get_caterer_cancellation_requests');
      if (cancellationError) throw cancellationError;
      setCancellationRequests(cancellationRows || []);
      const { data: gcashRows, error: gcashError } = await supabase.rpc('get_caterer_gcash_submissions');
      if (gcashError) throw gcashError;
      const submissionsWithReceipts = await Promise.all((gcashRows || []).map(async (payment) => {
        const { data: receiptData, error: receiptError } = await supabase.storage
          .from('gcash-payment-receipts')
          .createSignedUrl(payment.receipt_image, 3600);
        if (receiptError) throw receiptError;
        return { ...payment, receipt_url: receiptData.signedUrl };
      }));
      setGcashSubmissions(submissionsWithReceipts);
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
  useEffect(() => {
    if (!viewingReservation) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setViewingReservation(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [viewingReservation]);
  async function reviewGcash(payment, approve) {
    if (reviewingGcashId !== null) return;
    let reviewNote = null;
    if (approve) {
      if (!window.confirm(`Confirm that you received ${formatCurrency(payment.amount)} from ${payment.customer_name}?`)) return;
    } else {
      reviewNote = window.prompt('Why are you rejecting this receipt? (At least 5 characters)');
      if (reviewNote === null) return;
      if (reviewNote.trim().length < 5) {
        setStatus('Enter a receipt rejection reason of at least 5 characters.');
        return;
      }
    }

    setReviewingGcashId(payment.payment_id);
    try {
      const { error } = await supabase.rpc('review_gcash_payment', {
        p_payment_id: payment.payment_id,
        p_approve: approve,
        p_review_note: reviewNote,
      });
      if (error) throw error;
      setStatus(approve ? 'GCash payment confirmed. The booking is ready for your review.' : 'Receipt rejected. The customer can upload a corrected receipt.');
      await load();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setReviewingGcashId(null);
    }
  }
  async function reviewCancellation(request, approve) {
    let reviewNote = null;
    let refundAmount = 0;
    if (approve) {
      const defaultAmount = Number(request.paid_amount || 0).toFixed(2);
      const amountInput = window.prompt(
        `Enter the amount you agree to refund (maximum received: ${formatCurrency(request.paid_amount)}). The transfer is manual; do not mark it refunded yet.`,
        defaultAmount,
      );
      if (amountInput === null) return;
      refundAmount = Number(amountInput);
      if (!Number.isFinite(refundAmount)
        || Math.round(refundAmount * 100) / 100 !== refundAmount
        || refundAmount < 0
        || refundAmount > Number(request.paid_amount || 0)) {
        setStatus('Enter a refund amount up to the amount received, with no more than two decimal places.');
        return;
      }
      if (refundAmount < Number(request.paid_amount || 0)) {
        reviewNote = window.prompt('Explain why the refund is less than the amount received (at least 5 characters).');
        if (reviewNote === null) return;
        if (reviewNote.trim().length < 5) {
          setStatus('Enter a reason of at least 5 characters for a partial or zero refund.');
          return;
        }
      }
      if (!window.confirm(`Approve cancellation and record a manual refund of ${formatCurrency(refundAmount)}? This will cancel the booking. You must still send the refund via PayPal or GCash separately.`)) return;
    } else {
      reviewNote = window.prompt('Why are you declining this cancellation request? (At least 5 characters)');
      if (reviewNote === null) return;
      if (reviewNote.trim().length < 5) {
        setStatus('Enter a reason of at least 5 characters.');
        return;
      }
    }

    setReviewingCancellationId(request.request_id);
    try {
      const { error } = await supabase.rpc('review_reservation_cancellation', {
        p_request_id: request.request_id,
        p_approve: approve,
        p_review_note: reviewNote,
        p_refund_amount: refundAmount,
      });
      if (error) throw error;
      await load();
      setStatus(approve
        ? (refundAmount > 0
          ? 'Cancellation approved. Send the agreed refund manually, then record its PayPal transaction ID or GCash reference.'
          : 'Cancellation approved with no refund due.')
        : 'Cancellation request declined.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setReviewingCancellationId(null);
    }
  }
  async function recordRefund(request) {
    const reference = window.prompt(
      `After sending ${formatCurrency(request.refund_amount)} via ${request.payment_method === 'gcash' ? 'GCash' : request.payment_method === 'paypal' ? 'PayPal' : 'the agreed method'}, enter the transaction/reference number.`,
    );
    if (reference === null) return;
    if (reference.trim().length < 3) {
      setStatus('Enter the refund transaction/reference number.');
      return;
    }
    if (!window.confirm(`Confirm that ${formatCurrency(request.refund_amount)} has already been sent to ${request.customer_name}?`)) return;

    setReviewingCancellationId(request.request_id);
    try {
      const { error } = await supabase.rpc('record_reservation_refund', {
        p_request_id: request.request_id,
        p_refund_reference: reference.trim(),
      });
      if (error) throw error;
      await load();
      setStatus('Refund recorded as sent.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setReviewingCancellationId(null);
    }
  }
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
        {cancellationRequests.length > 0 && (
          <section className="cancellation-review-section" aria-labelledby="cancellation-review-title">
            <header>
              <div>
                <p className="eyebrow eyebrow-soft">Customer requests</p>
                <h2 id="cancellation-review-title">Cancellation &amp; refunds ({cancellationRequests.length})</h2>
                <p>Review cancellation requests. Any refund must be sent manually through PayPal or GCash before you record it as refunded.</p>
              </div>
            </header>
            <div className="cancellation-review-list">
              {cancellationRequests.map((request) => (
                <article className="cancellation-review-card" key={request.request_id}>
                  <div className="cancellation-review-details">
                    <strong>{request.package_name} · Reservation #{request.reservation_id}</strong>
                    <span>{request.customer_name} · {formatEventDate(request.event_date)}</span>
                    <span>Paid: {formatCurrency(request.paid_amount)} · Method: {formatPaymentMethod(request.payment_method)}</span>
                    <p><strong>Customer reason:</strong> {request.request_reason}</p>
                    {request.request_status === 'pending' ? (
                      <span className="cancellation-review-state">Waiting for cancellation decision</span>
                    ) : request.refund_status === 'refunded' ? (
                      <>
                        <span className="cancellation-review-state">Refund sent: {formatCurrency(request.refund_amount)}</span>
                        <span>Reference: {request.refund_reference}</span>
                      </>
                    ) : request.refund_status === 'not_required' ? (
                      <span className="cancellation-review-state">Cancellation approved · no refund due</span>
                    ) : (
                      <span className="cancellation-review-state">Cancellation approved · refund {formatCurrency(request.refund_amount)} is awaiting manual transfer</span>
                    )}
                  </div>
                  {request.request_status === 'pending' ? (
                    <div className="cancellation-review-actions">
                      <button
                        className="button button-primary button-small"
                        disabled={reviewingCancellationId !== null}
                        onClick={() => reviewCancellation(request, true)}
                        type="button"
                      >
                        {reviewingCancellationId === request.request_id ? 'Saving…' : 'Approve & set refund'}
                      </button>
                      <button
                        className="button reservation-reject-button button-small"
                        disabled={reviewingCancellationId !== null}
                        onClick={() => reviewCancellation(request, false)}
                        type="button"
                      >
                        Decline request
                      </button>
                    </div>
                  ) : request.refund_status === 'pending' ? (
                    <div className="cancellation-review-actions">
                      <button
                        className="button button-primary button-small"
                        disabled={reviewingCancellationId !== null}
                        onClick={() => recordRefund(request)}
                        type="button"
                      >
                        {reviewingCancellationId === request.request_id ? 'Saving…' : 'Record refund sent'}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )}
        {gcashSubmissions.length > 0 && (
          <section className="gcash-review-section" aria-labelledby="gcash-review-title">
            <header>
              <div>
                <p className="eyebrow eyebrow-soft">Manual payment review</p>
                <h2 id="gcash-review-title">GCash receipts ({gcashSubmissions.length})</h2>
                <p>Check your GCash account before confirming each payment. Confirmation marks the payment as received.</p>
              </div>
            </header>
            <div className="gcash-review-list">
              {gcashSubmissions.map((payment) => (
                <article className="gcash-review-card" key={payment.payment_id}>
                  <div>
                    <strong>{payment.package_name} · Reservation #{payment.reservation_id}</strong>
                    <span>{payment.customer_name} · {payment.payment_type === 'balance' ? 'Balance' : 'Down payment'} · {formatCurrency(payment.amount)}</span>
                    <span>{formatEventDate(payment.event_date)}</span>
                  </div>
                  <a href={payment.receipt_url} target="_blank" rel="noreferrer">
                    <img src={payment.receipt_url} alt={`GCash receipt from ${payment.customer_name}`} />
                    View full receipt
                  </a>
                  <div className="gcash-review-actions">
                    <button className="button button-primary button-small" disabled={reviewingGcashId !== null} onClick={() => reviewGcash(payment, true)} type="button">
                      {reviewingGcashId === payment.payment_id ? 'Saving…' : 'Confirm payment'}
                    </button>
                    <button className="button reservation-reject-button button-small" disabled={reviewingGcashId !== null} onClick={() => reviewGcash(payment, false)} type="button">
                      Reject receipt
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
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
                      <th scope="col">Venue</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Total</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReservations.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Package"><strong>{item.package_name || 'Catering package'}</strong></td>
                        <td data-label="Customer">{item.customer_name || 'Customer'}</td>
                        <td data-label="Event date">
                          <strong>{formatEventDate(item.event_date)}</strong>
                          <span className="caterer-history-time">{formatEventTimeRange(item.event_time, item.event_end_time)}</span>
                        </td>
                        <td data-label="Venue" className="caterer-history-venue" title={item.venue_address || item.location || ''}>{item.venue_name || item.location || 'Not provided'}</td>
                        <td data-label="Payment"><span className={`caterer-history-payment caterer-history-payment-${item.payment_status || 'pending'}`}>{item.payment_status || 'pending'}</span></td>
                        <td data-label="Total"><strong>{formatCurrency(item.total_amount)}</strong></td>
                        <td data-label="Action">
                          <button className="button button-secondary button-small" onClick={() => setViewingReservation(item)} type="button"><Eye size={14} aria-hidden="true" /> View</button>
                        </td>
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
                      <th scope="col">Venue</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Total</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReservations.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Package / status">
                          <strong>{item.package_name || 'Catering package'}</strong>
                          <span className={`caterer-history-payment caterer-history-payment-${item.reservation_status || 'pending'}`}>
                            {item.reservation_status || 'pending'}
                          </span>
                        </td>
                        <td data-label="Customer">{item.customer_name || 'Customer'}</td>
                        <td data-label="Event date">
                          <strong>{formatEventDate(item.event_date)}</strong>
                          <span className="caterer-history-time">{formatEventTimeRange(item.event_time, item.event_end_time)}</span>
                        </td>
                        <td data-label="Venue" className="caterer-history-venue" title={item.venue_address || item.location || ''}>{item.venue_name || item.location || 'Not provided'}</td>
                        <td data-label="Payment">
                          <span className={`caterer-history-payment caterer-history-payment-${item.payment_status || 'pending'}`}>
                            {item.payment_status || 'pending'}
                          </span>
                          <span className="caterer-history-time">Down payment: {formatCurrency(item.advance_payment)}</span>
                          <span className="caterer-history-time">Balance: {formatCurrency(item.payment_status === 'completed' ? 0 : item.balance_amount)}</span>
                        </td>
                        <td data-label="Total"><strong>{formatCurrency(item.total_amount)}</strong></td>
                        <td data-label="Action">
                          <div className="caterer-reservation-row-action">
                            <button className="button button-secondary button-small" onClick={() => setViewingReservation(item)} type="button"><Eye size={14} aria-hidden="true" /> View</button>
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
        {viewingReservation && (
          <div
            className="reservation-details-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-details-title"
            onClick={() => setViewingReservation(null)}
          >
            <section className="reservation-details-modal" onClick={(event) => event.stopPropagation()}>
              <header className="reservation-details-header">
                <div>
                  <p className="eyebrow eyebrow-soft">Booking details</p>
                  <h2 id="reservation-details-title">{viewingReservation.package_name || 'Catering package'}</h2>
                  <p>Reservation #{viewingReservation.id} · {viewingReservation.customer_name || 'Customer'}</p>
                </div>
                <button className="payment-receipt-close" onClick={() => setViewingReservation(null)} type="button" aria-label="Close booking details"><X size={18} /></button>
              </header>
              <div className="reservation-details-status">
                <span className={`caterer-history-payment caterer-history-payment-${viewingReservation.reservation_status || 'pending'}`}>{viewingReservation.reservation_status || 'pending'}</span>
                <span className={`caterer-history-payment caterer-history-payment-${viewingReservation.payment_status || 'pending'}`}>{viewingReservation.payment_status || 'pending'} payment</span>
              </div>
              <section className="reservation-details-section">
                <h3>Customer</h3>
                <dl>
                  <div><dt>Name</dt><dd>{viewingReservation.customer_name || 'Not provided'}</dd></div>
                  <div><dt>Email</dt><dd>{viewingReservation.customer_email || 'Not provided'}</dd></div>
                  <div><dt>Phone</dt><dd>{viewingReservation.customer_phone || 'Not provided'}</dd></div>
                </dl>
              </section>
              <section className="reservation-details-section">
                <h3>Event</h3>
                <dl>
                  <div><dt>Event type</dt><dd>{viewingReservation.event_type || 'Not provided'}</dd></div>
                  <div><dt>Date</dt><dd>{formatEventDate(viewingReservation.event_date)}</dd></div>
                  <div><dt>Time</dt><dd>{formatEventTimeRange(viewingReservation.event_time, viewingReservation.event_end_time)}</dd></div>
                </dl>
              </section>
              <section className="reservation-details-section">
                <h3>Venue</h3>
                <dl>
                  <div><dt>Venue name</dt><dd>{viewingReservation.venue_name || (viewingReservation.location?.split(' - ')[0] ?? 'Not provided')}</dd></div>
                  <div className="reservation-details-wide"><dt>Address</dt><dd>{viewingReservation.venue_address || viewingReservation.location?.split(' - ').slice(1).join(' - ') || viewingReservation.location || 'Not provided'}</dd></div>
                  <div><dt>City / Municipality</dt><dd>{viewingReservation.venue_city || 'Not provided'}</dd></div>
                  <div><dt>Barangay</dt><dd>{viewingReservation.venue_barangay || 'Not provided'}</dd></div>
                  <div><dt>Street / Building</dt><dd>{viewingReservation.venue_street || 'Not provided'}</dd></div>
                  <div><dt>Postal code</dt><dd>{viewingReservation.venue_postal || 'Not provided'}</dd></div>
                </dl>
              </section>
              <section className="reservation-details-section">
                <h3>Payment</h3>
                <dl>
                  <div><dt>Method</dt><dd>{formatPaymentMethod(viewingReservation.booking_payment_method)}</dd></div>
                  <div><dt>Package total</dt><dd>{formatCurrency(viewingReservation.total_amount)}</dd></div>
                  <div><dt>Down payment</dt><dd>{formatCurrency(viewingReservation.advance_payment)}</dd></div>
                  <div><dt>Remaining balance</dt><dd>{formatCurrency(viewingReservation.payment_status === 'completed' ? 0 : viewingReservation.balance_amount)}</dd></div>
                </dl>
              </section>
              {viewingReservation.special_requests && (
                <section className="reservation-details-section">
                  <h3>Special requests</h3>
                  <p>{viewingReservation.special_requests}</p>
                </section>
              )}
            </section>
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
