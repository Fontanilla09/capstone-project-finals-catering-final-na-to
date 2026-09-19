import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

export default function AdminActivity() {
  const [activities, setActivities] = useState([]); const [status, setStatus] = useState('');
  useEffect(() => { requestJson('/backend/dashboard_api.php?action=admin_activity').then((data) => setActivities(data.activities || [])).catch((error) => setStatus(error.message)); }, []);
  return <DashboardPage role="admin" section="activity"><div className="admin-workspace"><div className="admin-intro"><div><p className="eyebrow">Super admin tools</p><h2>Activity log</h2><p>Track important account decisions made by administrators.</p></div><span className="admin-section-count">{activities.length} entries</span></div>{status && <p className="form-alert error-alert">{status}</p>}<div className="admin-user-list">{activities.length ? activities.map((activity) => <article className="admin-record" key={activity.id}><div><strong>{activity.details}</strong><small>{activity.action.replaceAll('_', ' ')} by {activity.admin_email}</small></div><small>{activity.created_at}</small></article>) : <p className="admin-empty">No activity recorded yet.</p>}</div></div></DashboardPage>;
}