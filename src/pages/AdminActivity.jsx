import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

const actionLabels = {
  approve_customer: 'Customer account confirmed',
  reject_customer: 'Customer account rejected',
  approve_caterer: 'Caterer account approved',
  reject_caterer: 'Caterer account rejected',
  suspend_caterer: 'Caterer restricted',
  reinstate_caterer: 'Caterer restored',
};

function formatAction(action) {
  return actionLabels[action] || action.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
}

export default function AdminActivity() {
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  async function loadActivities() {
    setLoading(true);
    setStatus('');
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const [activityResult, accountsResult] = await Promise.all([
        supabase.rpc('get_admin_activity'),
        supabase.rpc('get_admin_accounts'),
      ]);
      if (activityResult.error) throw activityResult.error;

      const accountsByProfile = new Map();
      if (!accountsResult.error) {
        (accountsResult.data || []).forEach((account) => {
          if (account.customer_id) accountsByProfile.set(`customer:${account.customer_id}`, account.full_name);
          if (account.caterer_id) accountsByProfile.set(`caterer:${account.caterer_id}`, account.business_name);
        });
      }

      setActivities((activityResult.data || []).map((activity) => {
        const profileMatch = activity.details?.match(/^(Customer|Caterer) profile #(\d+)(?:\s*[—-]\s*(.*))?$/i);
        if (!profileMatch || profileMatch[3]) return activity;
        const profileType = profileMatch[1].toLocaleLowerCase();
        const profileName = accountsByProfile.get(`${profileType}:${profileMatch[2]}`);
        return profileName
          ? { ...activity, details: `${profileMatch[1]} profile #${profileMatch[2]} — ${profileName}` }
          : activity;
      }));
      if (accountsResult.error) setStatus(`Profile names could not be loaded: ${accountsResult.error.message}`);
    } catch (error) {
      setStatus(error.message || 'Unable to load admin activity.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadActivities(); }, []);

  const visibleActivities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return activities;
    return activities.filter((activity) => [
      formatAction(activity.action),
      activity.details,
      activity.admin_email,
    ].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [activities, search]);

  return (
    <DashboardPage role="admin" section="activity">
      <div className="admin-workspace">
        <div className="admin-intro admin-users-intro">
          <div>
            <p className="eyebrow">Super admin tools</p>
            <h2>Activity log</h2>
            <p>Review account confirmations, rejections, and other administrator decisions.</p>
          </div>
          <div className="admin-activity-controls">
            <span className="admin-section-count">{loading ? 'Loading...' : `${visibleActivities.length} entries`}</span>
            <button className="admin-refresh" disabled={loading} onClick={loadActivities} type="button">
              {loading ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
        </div>

        {status && <p className="form-alert error-alert" role="alert">{status}</p>}

        <section className="admin-users-directory" aria-label="Administrator activity">
          <div className="admin-users-toolbar admin-activity-toolbar">
            <input
              aria-label="Search activity"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search action, profile, or administrator..."
              type="search"
              value={search}
            />
          </div>

          <div className="admin-users-table-wrap">
            <table className="admin-users-table admin-activity-table">
              <thead>
                <tr><th>Action</th><th>Target profile / details</th><th>Administrator</th><th>Date and time</th></tr>
              </thead>
              <tbody>
                {visibleActivities.map((activity) => (
                  <tr key={activity.id}>
                    <td data-label="Action">
                      <span className={`admin-activity-action action-${activity.action}`}>
                        {formatAction(activity.action)}
                      </span>
                    </td>
                    <td data-label="Target profile / details">{activity.details || '—'}</td>
                    <td data-label="Administrator">{activity.admin_email || '—'}</td>
                    <td data-label="Date and time">{formatDateTime(activity.created_at)}</td>
                  </tr>
                ))}
                {!visibleActivities.length && (
                  <tr>
                    <td className="admin-users-empty" colSpan="4">
                      {loading ? 'Loading activity...' : status ? 'Activity data is unavailable.' : 'No activity matches your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardPage>
  );
}
