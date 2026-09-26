import { useEffect, useMemo, useState } from 'react';
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
  const [customer, setCustomer] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [status, setStatus] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_customer_dashboard');
      if (error) throw error;

      setCustomer(data?.customer || null);
      setReservations(data?.reservations || []);
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (reviewingId) {
      document.getElementById('review-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [reviewingId]);

  async function payBalance(id) {
    try {
      setStatus('');
      setStatus('Balance payment is not yet connected to Supabase.');
    } catch (error) {
      setStatus(error.message);
    }
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

  return (
    <DashboardPage role="customer" section="overview">
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
                    <td><strong>{item.package_name}</strong></td>
                    <td>{item.business_name}</td>
                    <td>{item.event_date}</td>
                    <td>{item.guest_count}</td>
                    <td>₱{Number(item.paid_amount).toLocaleString()} / ₱{Number(item.total_amount).toLocaleString()}</td>
                    <td><span className={statusClass(item.reservation_status)}>{item.reservation_status}</span></td>
                    <td>
                      {item.review_rating ? (
                        <span className="reviewed-label">★ {item.review_rating} rated</span>
                      ) : canReview(item) ? (
                        <button className="button button-primary button-small" onClick={() => setReviewingId(item.id)} type="button">Rate caterer</button>
                      ) : item.reservation_status === 'confirmed' && Number(item.paid_amount) < Number(item.total_amount) ? (
                        <button className="button button-primary button-small" onClick={() => payBalance(item.id)} type="button">Pay balance</button>
                      ) : (
                        <span className="muted-label">Awaiting</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" className="empty-cell">No booking requests found.</td>
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
      </div>
    </DashboardPage>
  );
}
