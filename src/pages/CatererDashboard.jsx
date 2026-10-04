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
        const { data: profileData, error: profileError } = await supabase.rpc('get_my_profile');
        if (profileError) throw profileError;
        const profile = profileData?.[0];
        if (!profile?.caterer_id) throw new Error('Caterer profile not found.');

        const [{ count: packageCount }, { data: catererData, error: catererError }, { data, error: reservationsError }] = await Promise.all([
          supabase.from('packages').select('id', { count: 'exact', head: true }).eq('caterer_id', profile.caterer_id),
          supabase.from('caterers').select('rating').eq('id', profile.caterer_id).maybeSingle(),
          supabase.rpc('get_caterer_reservations'),
        ]);

        if (catererError) throw catererError;
        if (reservationsError) throw reservationsError;

        const reservations = data || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pending = reservations.filter((item) => item.reservation_status === 'pending').length;
        const confirmed = reservations.filter((item) => item.reservation_status === 'confirmed').length;
        const completed = reservations.filter((item) => item.reservation_status === 'completed').length;

        if (active) {
          setStats({
            packages: Number(packageCount || 0),
            reservations: reservations.filter((item) => ['pending', 'confirmed'].includes(item.reservation_status)).length,
            upcoming: reservations.filter((item) => item.reservation_status === 'confirmed' && new Date(`${item.event_date}T00:00:00`) >= today).length,
            rating: Number(catererData?.rating || 0).toFixed(2),
            analytics: {
              booking_value: reservations.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
              collected: reservations.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
              average_booking: reservations.length ? reservations.reduce((sum, item) => sum + Number(item.total_amount || 0), 0) / reservations.length : 0,
              pending,
              confirmed,
              completed,
            },
          });
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

  return <DashboardPage role="caterer"><>{error && <p className="form-alert error-alert">{error}</p>}<div className="stats-grid"><article className="stat-card stat-card-packages"><div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true">▣</span><h3>Packages</h3></div><strong>{stats.packages}</strong></article><article className="stat-card stat-card-reservations"><div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true">◫</span><h3>Active reservations</h3></div><strong>{stats.reservations}</strong></article><article className="stat-card stat-card-upcoming"><div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true">◌</span><h3>Upcoming events</h3></div><strong>{stats.upcoming}</strong></article><article className="stat-card stat-card-rating"><div className="stat-card-header"><span className="stat-card-icon" aria-hidden="true">★</span><h3>Average rating</h3></div><strong>{stats.rating}</strong></article></div><section className="caterer-analytics"><div className="caterer-analytics-heading"><div><p className="eyebrow">Performance snapshot</p><h2>Booking analytics</h2></div><a href="/dashboard/caterer/reservations">View reservations ↗</a></div><div className="caterer-analytics-metrics"><article><span>Total booking value</span><strong>{money(stats.analytics.booking_value)}</strong></article><article><span>Collected payments</span><strong>{money(stats.analytics.collected)}</strong></article><article><span>Average booking</span><strong>{money(stats.analytics.average_booking)}</strong></article></div><div className="caterer-analytics-status"><div><span>Pending requests</span><b>{stats.analytics.pending || 0}</b></div><div><span>Confirmed events</span><b>{stats.analytics.confirmed || 0}</b></div><div><span>Completed events</span><b>{stats.analytics.completed || 0}</b></div></div></section><a className="button button-primary" href="/dashboard/caterer/services">Manage services <span>↗</span></a></></DashboardPage>;
}
