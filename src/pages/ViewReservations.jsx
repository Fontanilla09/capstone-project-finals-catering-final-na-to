import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function eventIsTodayOrPast(eventDate) {
  const date = new Date(`${eventDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date <= today;
}

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
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
  return (
    <DashboardPage role="caterer" section="reservations">
      <>
        {status && <p className="form-alert success-alert">{status}</p>}
        <div className="reservation-list">
          {reservations.length ? reservations.map((item) => (
            <article className="package-card reservation-card" key={item.id}>
              <div className="reservation-card-header">
                <div><p className="eyebrow">Booking request</p><h3>{item.package_name}</h3></div>
                <span className={`reservation-status reservation-status-${item.reservation_status}`}>{item.reservation_status}</span>
              </div>
              <div className="reservation-details">
                <p><strong>Customer</strong>{item.customer_name}</p>
                <p><strong>Event date</strong>{item.event_date} at {item.event_time}</p>
                <p><strong>Guests</strong>{item.guest_count}</p>
                <p className="reservation-location"><strong>Venue</strong>{item.location}</p>
                <p><strong>Payment</strong>{item.payment_status} · Down payment: ₱{Number(item.advance_payment || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="reservation-actions">
                {item.reservation_status === 'pending' && item.payment_status === 'partial' ? (
                  <button className="button button-primary" onClick={() => accept(item.id)} type="button">Accept reservation</button>
                ) : item.reservation_status === 'pending' && item.payment_status === 'pending' ? (
                  <button className="button reservation-reject-button" onClick={() => { setRejectingReservation(item); setRejectionReason(''); setStatus(''); }} type="button"><X size={16} aria-hidden="true" /> Reject</button>
                ) : item.reservation_status === 'confirmed' && eventIsTodayOrPast(item.event_date) ? (
                  <button className="button button-primary" onClick={() => complete(item.id)} type="button"><CheckCircle2 size={16} aria-hidden="true" /> Mark as completed</button>
                ) : item.reservation_status === 'cancelled' && item.payment_status === 'pending' ? (
                  <button className="button reservation-dismiss-button" onClick={() => dismissCancelled(item.id)} type="button" title="Remove unpaid cancelled booking" aria-label="Remove unpaid cancelled booking"><X size={16} aria-hidden="true" /></button>
                ) : (
                  <button className="button button-primary" disabled type="button">{item.reservation_status}</button>
                )}
              </div>
            </article>
          )) : <p>No reservations found.</p>}
        </div>
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
