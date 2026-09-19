import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

export default function CatererDashboard() {
  const [stats, setStats] = useState(null); const [error, setError] = useState('');
  useEffect(() => { requestJson('/backend/dashboard_api.php?action=caterer_overview').then((data) => setStats(data.stats)).catch((reason) => setError(reason.message)); }, []);
  return <DashboardPage role="caterer"><>{error && <p className="form-alert error-alert">{error}</p>}{stats ? <div className="stats-grid"><article className="stat-card"><h3>Packages</h3><strong>{stats.packages}</strong></article><article className="stat-card"><h3>Active reservations</h3><strong>{stats.reservations}</strong></article><article className="stat-card"><h3>Upcoming events</h3><strong>{stats.upcoming}</strong></article><article className="stat-card"><h3>Average rating</h3><strong>{stats.rating}</strong></article></div> : <p>Loading dashboard...</p>}<a className="button button-primary" href="/dashboard/caterer/services">Manage services <span>↗</span></a></></DashboardPage>;
}
