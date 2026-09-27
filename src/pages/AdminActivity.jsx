import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

export default function AdminActivity() {
  const [activities, setActivities] = useState([]); const [status, setStatus] = useState('');
  function activityLabel(activity) {
    const labels = { approve_customer: 'Customer approved by admin', reject_customer: 'Customer rejected by admin', approve_caterer: 'Caterer approved by admin', reject_caterer: 'Caterer rejected by admin' };
    return labels[activity.action] || activity.action.replaceAll('_', ' ');
  }
  useEffect(() => { supabase.rpc('get_admin_activity').then(({ data, error }) => { if (error) throw error; setActivities(data || []); }).catch((error) => setStatus(error.message)); }, []);
  return <DashboardPage role="admin" section="activity"><div className="admin-workspace"><div className="admin-intro"><div><p className="eyebrow">Super admin tools</p><h2>Activity log</h2><p>Track important account decisions made by administrators.</p></div><span className="admin-section-count">{activities.length} entries</span></div>{status && <p className="form-alert error-alert">{status}</p>}<div className="admin-user-list">{activities.length ? activities.map((activity) => <article className="admin-record" key={activity.id}><div><strong>{activity.details}</strong><small>{activityLabel(activity)}</small></div><small>{activity.created_at}</small></article>) : <p className="admin-empty">No activity recorded yet.</p>}</div></div></DashboardPage>;
}