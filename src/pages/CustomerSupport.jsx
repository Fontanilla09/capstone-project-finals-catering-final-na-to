import { useEffect, useState } from 'react';
import { ChevronDown, LifeBuoy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

const faqs = [
  {
    question: 'How can I check my booking status?',
    answer: 'Open Dashboard to see your bookings, event details, and the latest status.',
  },
  {
    question: 'How do I pay the remaining balance?',
    answer: 'For an eligible confirmed booking, use the Pay balance button in your reservations list.',
  },
  {
    question: 'How can I contact my caterer?',
    answer: 'Open Messages to ask the caterer questions about your package or event.',
  },
  {
    question: 'What happens after I send a booking issue?',
    answer: 'The admin team will review it in Reports & complaints and follow up using your account email if needed.',
  },
];

export default function CustomerSupport() {
  const [bookings, setBookings] = useState([]);
  const [reservationId, setReservationId] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ error: '', success: '' });

  useEffect(() => {
    let active = true;

    async function loadBookings() {
      try {
        const { data, error } = await supabase.rpc('get_my_support_bookings');
        if (error) throw error;
        if (!active) return;
        const rows = data || [];
        setBookings(rows);
        if (rows.length) setReservationId(String(rows[0].reservation_id));
      } catch (error) {
        if (active) setStatus({ error: error.message, success: '' });
      } finally {
        if (active) setLoadingBookings(false);
      }
    }

    loadBookings();
    return () => { active = false; };
  }, []);

  async function submitIssue(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    if (!reservationId) {
      setStatus({ error: 'Select the booking related to your issue.', success: '' });
      return;
    }
    if (!reason) {
      setStatus({ error: 'Select an issue type.', success: '' });
      return;
    }
    if (details.trim().length < 10) {
      setStatus({ error: 'Please describe the issue in at least 10 characters.', success: '' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_customer_booking_issue', {
        p_reservation_id: Number(reservationId),
        p_reason: reason,
        p_details: details.trim(),
      });
      if (error) throw error;
      setReason('');
      setDetails('');
      setStatus({
        error: '',
        success: 'Your booking issue was sent to the admin team. You can find it in their Reports & complaints queue.',
      });
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPage role="customer" section="support">
      <div className="customer-support-page">
        <header className="customer-support-heading">
          <p className="eyebrow">Customer care</p>
          <h2>Help &amp; Support</h2>
          <p>Find quick answers or send a booking issue to our admin team.</p>
        </header>

        <section className="customer-support-card">
          <div className="customer-support-section-heading">
            <LifeBuoy size={20} aria-hidden="true" />
            <div>
              <h3>Frequently asked questions</h3>
              <p>Quick answers about bookings, payments, and contacting your caterer.</p>
            </div>
          </div>
          <div className="customer-support-faq-list">
            {faqs.map((faq) => (
              <details className="customer-support-faq" key={faq.question}>
                <summary>{faq.question}<ChevronDown size={17} aria-hidden="true" /></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="customer-support-card">
          <div className="customer-support-section-heading">
            <div>
              <h3>Report a booking issue</h3>
              <p>This goes directly to the admin team, not to the caterer.</p>
            </div>
          </div>
          {status.error && <p className="form-alert error-alert" role="alert">{status.error}</p>}
          {status.success && <p className="form-alert success-alert" role="status">{status.success}</p>}
          {loadingBookings ? (
            <p className="muted-label">Loading your bookings...</p>
          ) : bookings.length ? (
            <form className="customer-support-form" onSubmit={submitIssue}>
              <label htmlFor="support-booking">Which booking is this about?</label>
              <select id="support-booking" value={reservationId} onChange={(event) => setReservationId(event.target.value)} required>
                {bookings.map((booking) => (
                  <option key={booking.reservation_id} value={booking.reservation_id}>
                    {booking.package_name} · {booking.caterer_name} · {booking.event_date}
                  </option>
                ))}
              </select>
              <label htmlFor="support-reason">Issue type</label>
              <select id="support-reason" value={reason} onChange={(event) => setReason(event.target.value)} required>
                <option value="">Select an issue</option>
                <option value="Payment problem">Payment problem</option>
                <option value="Booking status problem">Booking status problem</option>
                <option value="Cancellation or refund">Cancellation or refund</option>
                <option value="Caterer did not arrive">Caterer did not arrive</option>
                <option value="Other booking issue">Other booking issue</option>
              </select>
              <label htmlFor="support-details">Describe the issue</label>
              <textarea id="support-details" value={details} onChange={(event) => setDetails(event.target.value)} minLength={10} maxLength={2000} placeholder="Tell us what happened and how we can help." required />
              <small>Your report will be sent privately to the admin team for review.</small>
              <button className="button button-primary" disabled={submitting} type="submit">
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          ) : (
            <p className="customer-support-no-bookings">You need a booking before you can report a booking issue. For package questions, contact the caterer through Messages.</p>
          )}
        </section>
      </div>
    </DashboardPage>
  );
}
