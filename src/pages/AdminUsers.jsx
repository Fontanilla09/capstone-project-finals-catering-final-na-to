import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import DashboardPage from '../components/DashboardPage.jsx';

function accountName(user) { return user.role === 'customer' ? user.full_name : user.role === 'caterer' ? user.business_name : 'Super admin'; }
function verificationLabel(user) { if (user.role === 'admin') return 'Active'; return (user.customer_verified ?? user.caterer_verified) ? 'Verified' : 'Pending'; }

export default function AdminUsers() {
  const [users, setUsers] = useState([]); const [customers, setCustomers] = useState([]); const [caterers, setCaterers] = useState([]); const [status, setStatus] = useState('');
  async function load() {
    try {
      const [userData, customerData, catererData] = await Promise.all([
        requestJson('/backend/dashboard_api.php?action=admin_users'),
        requestJson('/backend/dashboard_api.php?action=admin_pending_customers'),
        requestJson('/backend/dashboard_api.php?action=admin_pending'),
      ]);
      setUsers(userData.users || []); setCustomers(customerData.customers || []); setCaterers(catererData.caterers || []);
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  async function decideCustomer(action, id) { try { await requestJson(`/backend/dashboard_api.php?action=${action}`, { method: 'POST', body: JSON.stringify({ customer_id: id }) }); setStatus(action === 'approve_customer' ? 'Customer verified.' : 'Customer verification rejected.'); load(); } catch (error) { setStatus(error.message); } }
  async function decideCaterer(action, id) { try { await requestJson(`/backend/dashboard_api.php?action=${action}`, { method: 'POST', body: JSON.stringify({ caterer_id: id }) }); setStatus(action === 'approve_caterer' ? 'Caterer verified.' : 'Caterer verification rejected.'); load(); } catch (error) { setStatus(error.message); } }
  return <DashboardPage role="admin" section="users"><div className="admin-workspace">
    <div className="admin-intro"><div><p className="eyebrow">Super admin tools</p><h2>User management</h2><p>Review registered accounts and handle pending verification approvals.</p></div><button className="admin-refresh" onClick={load} type="button">Refresh data</button></div>
    {status && <p className="form-alert error-alert">{status}</p>}
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Account access</p><h3>Pending approvals</h3></div><span className="admin-section-count">{customers.length + caterers.length} waiting</span></div><div className="admin-approval-grid"><div><h4>Customers <span>{customers.length}</span></h4>{customers.length ? customers.map((customer) => <article className="admin-record" key={customer.id}><div><strong>{customer.full_name}</strong><small>{customer.user_email} · {customer.phone}</small><small>Registered {customer.created_at}</small></div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCustomer('approve_customer', customer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCustomer('reject_customer', customer.id)} type="button">Reject</button></div></article>) : <p className="admin-empty">No customer approvals waiting.</p>}</div><div><h4>Caterers <span>{caterers.length}</span></h4>{caterers.length ? caterers.map((caterer) => <article className="admin-record" key={caterer.id}><div><strong>{caterer.business_name}</strong><small>{caterer.user_email} · {caterer.city || 'No city provided'}</small><small>Permit: {caterer.business_permit ? 'Uploaded' : 'Missing'}</small>{caterer.business_permit && <a className="admin-inline-link" href={`/uploads/permits/${caterer.business_permit}`} target="_blank" rel="noreferrer">View permit ↗</a>}</div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCaterer('approve_caterer', caterer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCaterer('reject_caterer', caterer.id)} type="button">Reject</button></div></article>) : <p className="admin-empty">No caterer approvals waiting.</p>}</div></div></section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Registered accounts</p><h3>All users</h3></div><span className="admin-section-count">{users.length} accounts</span></div><div className="admin-user-list">{users.length ? users.map((user) => <article className="admin-record" key={user.id}><div><strong>{accountName(user)}</strong><small>{user.email}</small><small>Joined {user.created_at}</small></div><div className="admin-user-meta"><span className={`admin-status admin-status-${user.role}`}>{user.role}</span><span className="admin-status admin-status-active">{verificationLabel(user)}</span></div></article>) : <p className="admin-empty">No accounts found.</p>}</div></section>
  </div></DashboardPage>;
}
