import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const emptyStats = {
  packages: 0,
  reservations: 0,
  upcoming: 0,
  rating: '0.00',
  analytics: {
    booking_value: 0,
    collected: 0,
    average_booking: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
  },
};

export default function CatererDashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data, error: reservationsError } = await supabase.rpc('get_caterer_reservations');
        if (reservationsError) throw reservationsError;
        const reservations = data || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pending = reservations.filter((item) => item.reservation_status === 'pending').length;
        const confirmed = reservations.filter((item) => item.reservation_status === 'confirmed').length;
        const completed = reservations.filter((item) => item.reservation_status === 'completed').length;

        if (active) {
          setStats((current) => ({
            ...current,
            reservations: reservations.filter((item) => ['pending', 'confirmed'].includes(item.reservation_status)).length,
            upcoming: reservations.filter((item) => item.reservation_status === 'confirmed' && new Date(`${item.event_date}T00:00:00`) >= today).length,
            analytics: { ...current.analytics, pending, confirmed, completed },
          }));
          setError('');
        }
      } catch (reason) {
        if (active) {
          setStats(emptyStats);
          setError('');
        }
      }
    }

    load();
    return () => { active = false; };
  }, []);

  return <DashboardPage role="caterer"><>{error && <p className="form-alert error-alert">{error}</p>}<div className="stats-grid"><article className="stat-card"><h3>Packages</h3><strong>{stats.packages}</strong></article><article className="stat-card"><h3>Active reservations</h3><strong>{stats.reservations}</strong></article><article className="stat-card"><h3>Upcoming events</h3><strong>{stats.upcoming}</strong></article><article className="stat-card"><h3>Average rating</h3><strong>{stats.rating}</strong></article></div><section className="caterer-analytics"><div className="caterer-analytics-heading"><div><p className="eyebrow">Performance snapshot</p><h2>Booking analytics</h2></div><a href="/dashboard/caterer/reservations">View reservations ↗</a></div><div className="caterer-analytics-metrics"><article><span>Total booking value</span><strong>{money(stats.analytics.booking_value)}</strong></article><article><span>Collected payments</span><strong>{money(stats.analytics.collected)}</strong></article><article><span>Average booking</span><strong>{money(stats.analytics.average_booking)}</strong></article></div><div className="caterer-analytics-status"><div><span>Pending requests</span><b>{stats.analytics.pending || 0}</b></div><div><span>Confirmed events</span><b>{stats.analytics.confirmed || 0}</b></div><div><span>Completed events</span><b>{stats.analytics.completed || 0}</b></div></div></section><a className="button button-primary" href="/dashboard/caterer/services">Manage services <span>↗</span></a></></DashboardPage>;
}
