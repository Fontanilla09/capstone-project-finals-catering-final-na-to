import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
  async function load() { try { const { data, error } = await supabase.rpc('get_caterer_reservations'); if (error) throw error; setReservations(data || []); setStatus(''); } catch (error) { setStatus(error.message); } }
  useEffect(() => { load(); }, []);
  async function accept(id) { try { const { error } = await supabase.rpc('accept_caterer_reservation', { reservation_id: id }); if (error) throw error; setStatus('Reservation accepted.'); await load(); } catch (error) { setStatus(error.message); } }
  return <DashboardPage role="caterer" section="reservations"><>{status && <p className="form-alert success-alert">{status}</p>}<div className="reservation-list">{reservations.length ? reservations.map((item) => <article className="package-card reservation-card" key={item.id}><div className="reservation-card-header"><div><p className="eyebrow">Booking request</p><h3>{item.package_name}</h3></div><span className={`reservation-status reservation-status-${item.reservation_status}`}>{item.reservation_status}</span></div><div className="reservation-details"><p><strong>Customer</strong>{item.customer_name}</p><p><strong>Event date</strong>{item.event_date} at {item.event_time}</p><p><strong>Guests</strong>{item.guest_count}</p><p className="reservation-location"><strong>Venue</strong>{item.location}</p><p><strong>Payment</strong>{item.payment_status} · Down payment: ₱{Number(item.advance_payment || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><button className="button button-primary" disabled={item.payment_status !== 'partial' || item.reservation_status !== 'pending'} onClick={() => accept(item.id)} type="button">{item.reservation_status === 'pending' && item.payment_status === 'partial' ? 'Accept reservation' : item.reservation_status}</button></article>) : <p>No reservations found.</p>}</div></></DashboardPage>;
}
