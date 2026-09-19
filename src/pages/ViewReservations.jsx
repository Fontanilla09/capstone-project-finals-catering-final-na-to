import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

export default function ViewReservations() {
  const [reservations, setReservations] = useState([]); const [status, setStatus] = useState('');
  const load = () => requestJson('/backend/dashboard_api.php?action=caterer_reservations').then((data) => setReservations(data.reservations || [])).catch((error) => setStatus(error.message));
  useEffect(() => { load(); }, []);
  async function verify(id) { try { await requestJson('/backend/dashboard_api.php?action=verify_gcash_payment', { method: 'POST', body: JSON.stringify({ reservation_id: id }) }); setStatus('GCash payment verified.'); load(); } catch (error) { setStatus(error.message); } }
  async function accept(id) { try { await requestJson('/backend/dashboard_api.php?action=accept_reservation', { method: 'POST', body: JSON.stringify({ reservation_id: id }) }); setStatus('Reservation accepted.'); load(); } catch (error) { setStatus(error.message); } }
  return <DashboardPage role="caterer" section="reservations"><>{status && <p className="form-alert success-alert">{status}</p>}<div className="reservation-list">{reservations.length ? reservations.map((item) => <article className="package-card" key={item.id}><h3>{item.package_name}</h3><p>{item.customer_name} · {item.event_date} · {item.guest_count} guests</p><p>Payment: {item.payment_status} · Reservation: {item.reservation_status}</p>{item.receipt_image && <p>GCash reference: {item.reference_number} · <a href={`/uploads/receipts/${item.receipt_image}`} target="_blank" rel="noreferrer">View receipt</a></p>}{item.payment_status === 'pending' && item.receipt_image ? <button className="button button-primary" onClick={() => verify(item.id)} type="button">Verify GCash payment</button> : <button className="button button-primary" disabled={item.payment_status !== 'partial' || item.reservation_status !== 'pending'} onClick={() => accept(item.id)} type="button">{item.reservation_status === 'pending' && item.payment_status === 'partial' ? 'Accept reservation' : item.reservation_status}</button>}</article>) : <p>No reservations found.</p>}</div></></DashboardPage>;
}
