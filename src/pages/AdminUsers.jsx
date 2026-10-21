import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function accountName(user) { return user.role === 'customer' ? user.full_name : user.role === 'caterer' ? user.business_name : 'Super admin'; }
function verificationLabel(user) {
  if (user.role === 'admin' || (user.customer_verified ?? user.caterer_verified)) return 'Active';
  if (user.rejection_reason) return 'Rejected';
  return 'Unverified';
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function relativeDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permitPreview, setPermitPreview] = useState(null);
  const [permitZoom, setPermitZoom] = useState(1);

  async function load() {
    setLoading(true);
    setStatus('');
    try {
      const [accountsResult, reservationsResult, reportsResult] = await Promise.all([
        supabase.rpc('get_admin_accounts'),
        supabase.from('reservations').select('customer_id, caterer_id'),
        supabase.from('customer_reports').select('customer_id, caterer_id, reporter_email'),
      ]);
      if (accountsResult.error) throw accountsResult.error;

      const accounts = accountsResult.data || [];
      const activity = new Map();
      (reservationsResult.data || []).forEach((reservation) => {
        [`customer:${reservation.customer_id}`, `caterer:${reservation.caterer_id}`].forEach((key) => {
          const current = activity.get(key) || 0;
          activity.set(key, current + 1);
        });
      });
      const reportCounts = new Map();
      (reportsResult.data || []).forEach((report) => {
        const keys = [
          report.customer_id && `customer:${report.customer_id}`,
          report.caterer_id && `caterer:${report.caterer_id}`,
          !report.customer_id && !report.caterer_id && report.reporter_email && `email:${report.reporter_email.toLocaleLowerCase()}`,
        ].filter(Boolean);
        keys.forEach((key) => reportCounts.set(key, (reportCounts.get(key) || 0) + 1));
      });

      setUsers(accounts.map((user) => {
        const profileKey = user.role === 'customer'
          ? `customer:${user.customer_id}`
          : user.role === 'caterer'
            ? `caterer:${user.caterer_id}`
            : null;
        const emailKey = user.email ? `email:${user.email.toLocaleLowerCase()}` : null;
        return {
          ...user,
          activity: {
            count: profileKey ? activity.get(profileKey) || 0 : 0,
          },
          reports: (profileKey && reportCounts.get(profileKey)) ?? (emailKey && reportCounts.get(emailKey)) ?? 0,
        };
      }));

      const errors = [];
      if (reservationsResult.error) errors.push(`Activity totals unavailable: ${reservationsResult.error.message}`);
      if (reportsResult.error) errors.push(`Report totals unavailable: ${reportsResult.error.message}`);
      setStatus(errors.join(' '));
    } catch (error) {
      setStatus(error.message || 'Unable to load user accounts.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  const userCounts = useMemo(() => ({
    all: users.length,
    customer: users.filter((user) => user.role === 'customer').length,
    caterer: users.filter((user) => user.role === 'caterer').length,
  }), [users]);
  const visibleUsers = useMemo(() => users
    .filter((user) => userType === 'all' || user.role === userType)
    .filter((user) => statusFilter === 'all' || verificationLabel(user).toLocaleLowerCase() === statusFilter)
    .filter((user) => {
      const query = search.trim().toLocaleLowerCase();
      return !query || [
        accountName(user),
        user.email,
        user.business_name,
        user.full_name,
        user.role,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    })
    .sort((first, second) => {
      if (sortOrder === 'oldest') return new Date(first.created_at || 0) - new Date(second.created_at || 0);
      if (sortOrder === 'name') return accountName(first).localeCompare(accountName(second));
      if (sortOrder === 'activity') return second.activity.count - first.activity.count;
      return new Date(second.created_at || 0) - new Date(first.created_at || 0);
    }), [users, userType, statusFilter, search, sortOrder]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const pagedUsers = visibleUsers.slice((page - 1) * pageSize, page * pageSize);
  const selectedPageIds = pagedUsers.map((user) => user.id);
  const allPageSelected = selectedPageIds.length > 0 && selectedPageIds.every((id) => selectedUsers.includes(id));
  const firstVisible = visibleUsers.length ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, visibleUsers.length);

  useEffect(() => {
    setPage(1);
    setSelectedUsers([]);
  }, [userType, statusFilter, search, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function toggleUserSelection(id) {
    setSelectedUsers((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
  }

  function toggleCurrentPageSelection() {
    setSelectedUsers((current) => allPageSelected
      ? current.filter((id) => !selectedPageIds.includes(id))
      : [...new Set([...current, ...selectedPageIds])]);
  }
  useEffect(() => {
    if (!permitPreview) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setPermitPreview(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [permitPreview]);
  async function decideCaterer(action, catererProfileId) { try { const { error } = await supabase.rpc('set_caterer_verification', { caterer_id: catererProfileId, approved: action === 'approve_caterer' }); if (error) throw error; setStatus('Caterer verified.'); await load(); } catch (error) { setStatus(error.message); } }
  async function openPermit(path) {
    if (!path || typeof path !== 'string' || path.trim() === '') return;
    const trimmed = path.trim();
    let signedUrl = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      signedUrl = trimmed;
    } else {
      const { data, error } = await supabase.storage.from('permits').createSignedUrl(trimmed, 3600);
      if (error || !data?.signedUrl) {
        setStatus(error?.message || 'Unable to open the business permit.');
        return;
      }
      signedUrl = data.signedUrl;
    }
    const filePath = decodeURIComponent(signedUrl.split('?')[0]).toLowerCase();
    setPermitZoom(1);
    setPermitPreview({ url: signedUrl, isPdf: filePath.endsWith('.pdf') });
  }
  return <DashboardPage role="admin" section="users"><div className="admin-workspace admin-users-workspace">
    <div className="admin-intro admin-users-intro">
      <div><p className="eyebrow">Super admin tools</p><h2>User management</h2><p>Review account status, activity, and reports across your platform.</p></div>
      <button className="admin-refresh" disabled={loading} onClick={load} type="button">{loading ? <span className="loading-spinner loading-spinner-inline" role="status" aria-label="Refreshing" /> : 'Refresh data'}</button>
    </div>
    {status && <p className="form-alert error-alert" role="alert">{status}</p>}

    <div className="admin-users-summary">
      <article><span>All users</span><strong>{loading ? '—' : userCounts.all}</strong></article>
      <article><span>Customers</span><strong>{loading ? '—' : userCounts.customer}</strong></article>
      <article><span>Caterers</span><strong>{loading ? '—' : userCounts.caterer}</strong></article>
      <article><span>Unverified</span><strong>{loading ? '—' : users.filter((user) => verificationLabel(user) === 'Unverified').length}</strong></article>
    </div>

    <section className="admin-users-directory" aria-label="User directory">
      <div className="admin-users-tabs" role="tablist" aria-label="Filter users by type">
        {[
          ['all', 'All users', userCounts.all],
          ['customer', 'Customers', userCounts.customer],
          ['caterer', 'Caterers', userCounts.caterer],
        ].map(([key, label, count]) => (
          <button aria-selected={userType === key} className={userType === key ? 'active' : ''} key={key} onClick={() => setUserType(key)} role="tab" type="button">
            {label}<span>{count}</span>
          </button>
        ))}
      </div>

      <div className="admin-users-toolbar">
        <input aria-label="Search users" onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, business..." type="search" value={search} />
        <select aria-label="Filter by account status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="all">All status</option><option value="active">Active</option><option value="unverified">Unverified</option><option value="rejected">Rejected</option>
        </select>
        <select aria-label="Sort users" onChange={(event) => setSortOrder(event.target.value)} value={sortOrder}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name: A–Z</option><option value="activity">Most active</option>
        </select>
      </div>

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th className="admin-users-check-column"><input aria-label="Select all users on this page" checked={allPageSelected} onChange={toggleCurrentPageSelection} type="checkbox" /></th>
              <th>User</th><th>Role</th><th>Status</th><th>Activity</th><th>Joined</th><th>Last active</th><th>Reports</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedUsers.map((user, index) => {
              const state = verificationLabel(user);
              const canReview = user.role === 'caterer' && user.caterer_verification_submitted === true && !user.caterer_verified && !user.rejection_reason;
              const profileId = user.role === 'customer' ? user.customer_id ?? user.id : user.caterer_id ?? user.id;
              return (
                <tr key={user.id}>
                  <td className="admin-users-check-column"><input aria-label={`Select ${accountName(user)}`} checked={selectedUsers.includes(user.id)} onChange={() => toggleUserSelection(user.id)} type="checkbox" /></td>
                  <td data-label="User">
                    <div className="admin-users-identity">
                      <span className={`admin-users-avatar tone-${index % 6}`}>{accountName(user)?.trim()?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                      <span><strong>{accountName(user)}</strong><small>{user.email || 'No email provided'}</small></span>
                    </div>
                  </td>
                  <td data-label="Role"><span className={`admin-users-role role-${user.role}`}>{user.role === 'customer' ? 'Customer' : user.role === 'caterer' ? 'Caterer' : 'Admin'}</span></td>
                  <td data-label="Status"><span className={`admin-users-status state-${state.toLocaleLowerCase()}`}>{state}</span></td>
                  <td data-label="Activity">{user.role === 'admin' ? '—' : `${user.activity.count} booking${user.activity.count === 1 ? '' : 's'}`}</td>
                  <td data-label="Joined">{formatDate(user.created_at)}</td>
                  <td data-label="Last active">{user.role === 'admin' ? '—' : relativeDate(user.last_active_at)}</td>
                  <td data-label="Reports">{user.reports ? <span className="admin-users-report-count">⚑ {user.reports}</span> : '—'}</td>
                  <td data-label="Actions">
                    <div className="admin-users-actions">
                      {canReview && <>
                        <button className="admin-users-approve" disabled={loading} onClick={() => decideCaterer('approve_caterer', profileId)} type="button">Approve</button>
                      </>}
                      {user.role === 'caterer' && user.business_permit && <button className="admin-users-permit" onClick={() => openPermit(user.business_permit)} type="button">Permit</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!pagedUsers.length && <tr><td className="admin-users-empty" colSpan="9">{loading ? <LoadingSpinner compact /> : 'No users match these filters.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="admin-users-pagination">
        <span>{selectedUsers.length ? `${selectedUsers.length} selected · ` : ''}Showing {firstVisible}–{lastVisible} of {visibleUsers.length}</span>
        <div>
          <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">‹</button>
          <span>Page {page} of {pageCount}</span>
          <button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">›</button>
        </div>
      </div>
    </section>
    {permitPreview && (
      createPortal(
        <div className="permit-preview-overlay" role="dialog" aria-modal="true" aria-label="Business permit preview" onClick={() => setPermitPreview(null)}>
          <section className="permit-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header className="permit-preview-header">
              <div><p className="eyebrow">Caterer verification</p><h3>Business permit</h3></div>
              <div className="permit-preview-controls">
                {!permitPreview.isPdf && (
                  <>
                    <button aria-label="Zoom out" disabled={permitZoom <= 1} onClick={() => setPermitZoom((zoom) => Math.max(1, zoom - 0.25))} type="button"><ZoomOut size={18} /></button>
                    <span>{Math.round(permitZoom * 100)}%</span>
                    <button aria-label="Zoom in" disabled={permitZoom >= 3} onClick={() => setPermitZoom((zoom) => Math.min(3, zoom + 0.25))} type="button"><ZoomIn size={18} /></button>
                  </>
                )}
                <a href={permitPreview.url} rel="noreferrer" target="_blank">Open original</a>
                <button aria-label="Close permit preview" onClick={() => setPermitPreview(null)} type="button"><X size={19} /></button>
              </div>
            </header>
            <div className="permit-preview-stage">
              {permitPreview.isPdf ? (
                <iframe title="Business permit PDF" src={permitPreview.url} />
              ) : (
                <img alt="Uploaded business permit" src={permitPreview.url} style={{ transform: `scale(${permitZoom})` }} />
              )}
            </div>
          </section>
        </div>,
        document.body,
      )
    )}
  </div></DashboardPage>;
}
