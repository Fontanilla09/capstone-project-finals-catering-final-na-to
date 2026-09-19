import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
  const load = () => requestJson('/backend/dashboard_api.php?action=caterer_reservations').then((data) => setReservations(data.reservations || [])).catch((error) => setStatus(error.message));
  useEffect(() => { load(); }, []);
  async function accept(id) { try { await requestJson('/backend/dashboard_api.php?action=accept_reservation', { method: 'POST', body: JSON.stringify({ reservation_id: id }) }); setStatus('Reservation accepted.'); load(); } catch (error) { setStatus(error.message); } }
  return <DashboardPage role="caterer" section="reservations"><>{status && <p className="form-alert success-alert">{status}</p>}<div className="reservation-list">{reservations.length ? reservations.map((item) => <article className="package-card" key={item.id}><h3>{item.package_name}</h3><p>{item.customer_name} · {item.event_date} · {item.guest_count} guests</p><p>Payment: {item.payment_status} · Reservation: {item.reservation_status}</p><button className="button button-primary" disabled={item.reservation_status !== 'pending'} onClick={() => accept(item.id)} type="button">{item.reservation_status === 'pending' ? 'Accept reservation' : item.reservation_status}</button></article>) : <p>No completed-payment reservations found.</p>}</div></></DashboardPage>;
}
