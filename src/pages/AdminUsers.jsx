import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function accountName(user) { return user.role === 'customer' ? user.full_name : user.role === 'caterer' ? user.business_name : 'Super admin'; }
function verificationLabel(user) { if (user.role === 'admin') return 'Active'; if (user.rejection_reason) return 'Rejected'; return (user.customer_verified ?? user.caterer_verified) ? 'Verified' : 'Pending'; }

export default function AdminUsers() {
  const [users, setUsers] = useState([]); const [customers, setCustomers] = useState([]); const [caterers, setCaterers] = useState([]); const [status, setStatus] = useState('');
  const [rejectingAccount, setRejectingAccount] = useState(null); const [rejectionReason, setRejectionReason] = useState('');
  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_admin_accounts');
      if (error) throw error;
      const accounts = data || [];
      setUsers(accounts);
      setCustomers(accounts.filter((user) => user.role === 'customer' && !user.customer_verified && !user.rejection_reason));
      setCaterers(accounts.filter((user) => user.role === 'caterer' && user.caterer_verification_submitted === true && !user.caterer_verified && !user.rejection_reason));
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  function requestRejection(type, account) {
    setRejectingAccount({ type, id: type === 'customer' ? account.customer_id ?? account.id : account.caterer_id ?? account.id, name: accountName(account) });
    setRejectionReason('');
    setStatus('');
  }
  async function decideCustomer(action, customerProfileId) { try { const { error } = await supabase.rpc('set_customer_verification', { customer_id: customerProfileId, approved: action === 'approve_customer', p_rejection_reason: null }); if (error) throw error; setStatus('Customer verified.'); await load(); } catch (error) { setStatus(error.message); } }
  async function decideCaterer(action, catererProfileId) { try { const { error } = await supabase.rpc('set_caterer_verification', { caterer_id: catererProfileId, approved: action === 'approve_caterer', p_rejection_reason: null }); if (error) throw error; setStatus('Caterer verified.'); await load(); } catch (error) { setStatus(error.message); } }
  async function submitRejection(event) {
    event.preventDefault();
    if (!rejectingAccount) return;
    const reason = rejectionReason.trim();
    if (reason.length < 5) { setStatus('Please enter a reason of at least 5 characters.'); return; }
    try {
      const isCustomer = rejectingAccount.type === 'customer';
      const { error } = await supabase.rpc(isCustomer ? 'set_customer_verification' : 'set_caterer_verification', {
        [isCustomer ? 'customer_id' : 'caterer_id']: rejectingAccount.id,
        approved: false,
        p_rejection_reason: reason,
      });
      if (error) throw error;
      setRejectingAccount(null);
      setRejectionReason('');
      setStatus(`${isCustomer ? 'Customer' : 'Caterer'} rejected. The reason has been saved.`);
      await load();
    } catch (error) { setStatus(error.message); }
  }
  async function openPermit(path) {
    if (!path || typeof path !== 'string' || path.trim() === '') return;
    const trimmed = path.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      window.open(trimmed, '_blank', 'noopener,noreferrer');
      return;
    }
    const { data, error } = await supabase.storage.from('permits').createSignedUrl(trimmed, 3600);
    if (error || !data?.signedUrl) {
      setStatus(error?.message || 'Unable to open the business permit.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }
  return <DashboardPage role="admin" section="users"><div className="admin-workspace">
    <div className="admin-intro"><div><p className="eyebrow">Super admin tools</p><h2>User management</h2><p>Review registered accounts and handle pending verification approvals.</p></div><button className="admin-refresh" onClick={load} type="button">Refresh data</button></div>
    {status && <p className="form-alert error-alert">{status}</p>}
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Account access</p><h3>Pending approvals</h3></div><span className="admin-section-count">{customers.length + caterers.length} waiting</span></div><div className="admin-approval-grid"><div><h4>Customers <span>{customers.length}</span></h4>{customers.length ? customers.map((customer) => <article className="admin-record" key={customer.id}><div><strong>{customer.full_name}</strong><small>{customer.email} · {customer.phone}</small><small>Registered {customer.created_at}</small></div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCustomer('approve_customer', customer.customer_id ?? customer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => requestRejection('customer', customer)} type="button">Reject</button></div></article>) : <p className="admin-empty">No customer approvals waiting.</p>}</div><div id="caterer-approvals"><h4>Caterers <span>{caterers.length}</span></h4>{caterers.length ? caterers.map((caterer) => <article className="admin-record" key={caterer.id}><div><strong>{caterer.business_name}</strong><small>{caterer.email}</small><small>Phone: {caterer.phone || 'Not provided'} · City: {caterer.city || 'Not provided'}</small><small>Address: {caterer.address || 'Not provided'}</small><small>PayPal: {caterer.paypal_email || 'Not provided'}</small><small>Permit: {caterer.business_permit ? 'Uploaded' : 'Missing'}</small>{caterer.business_permit && <button className="admin-inline-link" onClick={() => openPermit(caterer.business_permit)} type="button">View permit ↗</button>}</div><div className="admin-actions"><button className="button button-primary" onClick={() => decideCaterer('approve_caterer', caterer.caterer_id ?? caterer.id)} type="button">Approve</button><button className="button admin-button-muted" onClick={() => requestRejection('caterer', caterer)} type="button">Reject</button></div></article>) : <p className="admin-empty">No caterer approvals waiting.</p>}</div></div></section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Registered accounts</p><h3>All users</h3></div><span className="admin-section-count">{users.length} accounts</span></div><div className="admin-user-list">{users.length ? users.map((user) => <article className="admin-record" key={user.id}><div><strong>{accountName(user)}</strong><small>{user.email}</small><small>Joined {user.created_at}</small>{user.rejection_reason && <small>Rejection reason: {user.rejection_reason}</small>}{user.role === 'caterer' && <><small>Phone: {user.phone || 'Not provided'} · City: {user.city || 'Not provided'}</small><small>Address: {user.address || 'Not provided'}</small><small>PayPal: {user.paypal_email || 'Not provided'}</small><small>Business permit: {user.business_permit ? 'Uploaded' : 'Missing'}</small>{user.business_permit && <button className="admin-inline-link" onClick={() => openPermit(user.business_permit)} type="button">View latest permit ↗</button>}</>}</div><div className="admin-user-meta"><span className={`admin-status admin-status-${user.role}`}>{user.role}</span><span className={`admin-status ${user.rejection_reason ? 'admin-status-rejected' : 'admin-status-active'}`}>{verificationLabel(user)}</span></div></article>) : <p className="admin-empty">No accounts found.</p>}</div></section>
    {rejectingAccount && <div className="account-reject-overlay" role="dialog" aria-modal="true" aria-label={`Reject ${rejectingAccount.type} account`} onClick={() => setRejectingAccount(null)}><form className="account-reject-form" onSubmit={submitRejection} onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Reject account</p><h3>{rejectingAccount.name}</h3><p>This reason will be shown to the user when they try to sign in.</p></div></header><label htmlFor="account-rejection-reason">Reason for rejection</label><textarea id="account-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} minLength={5} required placeholder="Explain why this account was rejected." />{status && <p className="form-alert error-alert">{status}</p>}<div className="account-reject-footer"><span>{rejectionReason.trim().length}/500</span><button className="button button-secondary" onClick={() => setRejectingAccount(null)} type="button">Cancel</button><button className="button admin-button-muted" disabled={rejectionReason.trim().length < 5} type="submit">Reject account</button></div></form></div>}
  </div></DashboardPage>;
}
