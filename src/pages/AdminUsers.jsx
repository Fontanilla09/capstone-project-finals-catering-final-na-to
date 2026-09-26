import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function accountName(user) { return user.role === 'customer' ? user.full_name : user.role === 'caterer' ? user.business_name : 'Super admin'; }
function verificationLabel(user) { if (user.role === 'admin') return 'Active'; return (user.customer_verified ?? user.caterer_verified) ? 'Verified' : 'Pending'; }

export default function AdminUsers() {
  const [users, setUsers] = useState([]); const [customers, setCustomers] = useState([]); const [caterers, setCaterers] = useState([]); const [status, setStatus] = useState('');
  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_admin_accounts');
      if (error) throw error;
      const accounts = data || [];
      setUsers(accounts);
      setCustomers(accounts.filter((user) => user.role === 'customer' && !user.customer_verified));
      setCaterers(accounts.filter((user) => user.role === 'caterer' && (user.caterer_verification_submitted === true) && !user.caterer_verified));
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  async function decideCustomer(action, customerProfileId) { try { const { error } = await supabase.rpc('set_customer_verification', { customer_id: customerProfileId, approved: action === 'approve_customer' }); if (error) throw error; setStatus(action === 'approve_customer' ? 'Customer verified.' : 'Customer rejected and removed.'); load(); } catch (error) { setStatus(error.message); } }
  async function decideCaterer(action, catererProfileId) { try { const { error } = await supabase.rpc('set_caterer_verification', { caterer_id: catererProfileId, approved: action === 'approve_caterer' }); if (error) throw error; setStatus(action === 'approve_caterer' ? 'Caterer verified.' : 'Caterer rejected and removed.'); load(); } catch (error) { setStatus(error.message); } }
  function permitUrl(path) {
    if (!path || typeof path !== 'string' || path.trim() === '') return null;
    const trimmed = path.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/')) return trimmed;
    return `/uploads/permits/${trimmed}`;
  }
  return <DashboardPage role="admin" section="users"><div className="admin-workspace">
    <div className="admin-intro"><div><p className="eyebrow">Super admin tools</p><h2>User management</h2><p>Review registered accounts and handle pending verification approvals.</p></div><button className="admin-refresh" onClick={load} type="button">Refresh data</button></div>
    {status && <p className="form-alert error-alert">{status}</p>}
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Account access</p><h3>Pending approvals</h3></div><span className="admin-section-count">{customers.length + caterers.length} waiting</span></div><div className="admin-approval-grid"><div><h4>Customers <span>{customers.length}</span></h4>{customers.length ? customers.map((customer) => <article className="admin-record" key={customer.id}><div><strong>{customer.full_name}</strong><small>{customer.user_email} · {customer.phone}</small><small>Registered {customer.created_at}</small></div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCustomer('approve_customer', customer.customer_id ?? customer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCustomer('reject_customer', customer.customer_id ?? customer.id)} type="button">Reject</button></div></article>) : <p className="admin-empty">No customer approvals waiting.</p>}</div><div><h4>Caterers <span>{caterers.length}</span></h4>{caterers.length ? caterers.map((caterer) => { const permitLink = permitUrl(caterer.business_permit); return <article className="admin-record" key={caterer.id}><div><strong>{caterer.business_name}</strong><small>{caterer.user_email}</small><small>Phone: {caterer.phone || 'Not provided'} · City: {caterer.city || 'Not provided'}</small><small>Address: {caterer.address || 'Not provided'}</small><small>Description: {caterer.description || 'Not provided'}</small><small>PayPal: {caterer.paypal_email || 'Not provided'}</small><small>Permit: {caterer.business_permit ? 'Uploaded' : 'Missing'}</small>{permitLink && <a className="admin-inline-link" href={permitLink} target="_blank" rel="noreferrer">View permit ↗</a>}</div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCaterer('approve_caterer', caterer.caterer_id ?? caterer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => decideCaterer('reject_caterer', caterer.caterer_id ?? caterer.id)} type="button">Reject</button></div></article>; }) : <p className="admin-empty">No caterer approvals waiting.</p>}</div></div></section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Registered accounts</p><h3>All users</h3></div><span className="admin-section-count">{users.length} accounts</span></div><div className="admin-user-list">{users.length ? users.map((user) => <article className="admin-record" key={user.id}><div><strong>{accountName(user)}</strong><small>{user.email}</small><small>Joined {user.created_at}</small></div><div className="admin-user-meta"><span className={`admin-status admin-status-${user.role}`}>{user.role}</span><span className="admin-status admin-status-active">{verificationLabel(user)}</span></div></article>) : <p className="admin-empty">No accounts found.</p>}</div></section>
  </div></DashboardPage>;
}
