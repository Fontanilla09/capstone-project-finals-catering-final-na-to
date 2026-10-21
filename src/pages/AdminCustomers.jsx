import { useEffect, useMemo, useState } from 'react';
import { UsersRound } from 'lucide-react';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { supabase } from '../lib/supabase';

const currencyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : '—';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCustomerId, setSavingCustomerId] = useState(null);
  const [rejectingCustomer, setRejectingCustomer] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('applications');
  const [sortOrder, setSortOrder] = useState('newest');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load({ keepNotice = false } = {}) {
    setLoading(true);
    setError('');
    if (!keepNotice) setNotice('');
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error: queryError } = await supabase.rpc('get_admin_customers');
      if (queryError) throw queryError;
      setCustomers(data || []);
      return true;
    } catch (loadError) {
      setError(loadError.code === 'PGRST202'
        ? 'Customer management is not set up yet. Run database/supabase_customer_management_migration.sql in Supabase SQL Editor.'
        : loadError.message || 'Unable to load customer accounts.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const pendingCustomers = customers.filter((customer) => !customer.is_verified && !customer.rejection_reason);
  const verifiedCustomers = customers.filter((customer) => customer.is_verified);
  const activeCustomers = customers.filter((customer) => customer.is_verified || !customer.rejection_reason);
  const totalSpent = verifiedCustomers.reduce((sum, customer) => sum + (Number(customer.total_spent) || 0), 0);
  const visibleCustomers = useMemo(() => customers
    .filter((customer) => activeTab === 'applications'
      ? !customer.is_verified && !customer.rejection_reason
      : customer.is_verified)
    .filter((customer) => {
      const query = search.trim().toLocaleLowerCase();
      return !query || [
        customer.full_name,
        customer.email,
        customer.phone,
        customer.address,
        customer.city,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    })
    .sort((first, second) => {
      if (sortOrder === 'name') return (first.full_name || '').localeCompare(second.full_name || '');
      if (sortOrder === 'spent') return Number(second.total_spent) - Number(first.total_spent);
      return new Date(second.created_at || 0) - new Date(first.created_at || 0);
    }), [activeTab, customers, search, sortOrder]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleCustomers.length / pageSize));
  const pageCustomers = visibleCustomers.slice((page - 1) * pageSize, page * pageSize);
  const firstVisible = visibleCustomers.length ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, visibleCustomers.length);

  useEffect(() => { setPage(1); }, [activeTab, search, sortOrder]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  async function confirmAccount(customer) {
    setSavingCustomerId(customer.customer_id);
    setError('');
    setNotice('');
    try {
      const { error: approvalError } = await supabase.rpc('set_customer_verification', {
        customer_id: customer.customer_id,
        approved: true,
      });
      if (approvalError) throw approvalError;
      const refreshed = await load({ keepNotice: true });
      setNotice(refreshed
        ? `${customer.full_name || 'Customer'}'s account has been confirmed.`
        : 'Account confirmed, but the customer list could not be refreshed.');
    } catch (approvalError) {
      setError(approvalError.message || 'Unable to confirm this customer account.');
    } finally {
      setSavingCustomerId(null);
    }
  }

  function openRejectionForm(customer) {
    setRejectingCustomer(customer);
    setRejectionReason('');
    setError('');
    setNotice('');
  }

  async function rejectAccount(event) {
    event.preventDefault();
    if (!rejectingCustomer) return;
    const reason = rejectionReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setError('Enter a rejection reason between 5 and 500 characters.');
      return;
    }

    setSavingCustomerId(rejectingCustomer.customer_id);
    setError('');
    setNotice('');
    try {
      const { error: rejectionError } = await supabase.rpc('set_customer_verification', {
        customer_id: rejectingCustomer.customer_id,
        approved: false,
        p_rejection_reason: reason,
      });
      if (rejectionError) throw rejectionError;
      const rejectedName = rejectingCustomer.full_name || 'Customer';
      setRejectingCustomer(null);
      setRejectionReason('');
      const refreshed = await load({ keepNotice: true });
      setNotice(refreshed
        ? `${rejectedName}'s application was rejected.`
        : 'Application rejected, but the customer list could not be refreshed.');
    } catch (rejectionError) {
      setError(rejectionError.message || 'Unable to reject this customer application.');
    } finally {
      setSavingCustomerId(null);
    }
  }

  return (
    <DashboardPage role="admin" section="customer-management">
      <div className="admin-workspace admin-users-workspace">
        <div className="admin-intro admin-users-intro">
          <div>
            <p className="eyebrow">Super admin tools</p>
            <h2>Customer Management</h2>
            <p>Review customer details, confirm accounts, and track verified payment totals.</p>
          </div>
          <button className="admin-refresh" disabled={loading} onClick={() => load()} type="button">
            {loading ? <span className="loading-spinner loading-spinner-inline" role="status" aria-label="Refreshing" /> : 'Refresh data'}
          </button>
        </div>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}
        {notice && <p className="form-alert success-alert" role="status">{notice}</p>}

        <div className="admin-users-summary">
          <article><span>Total customers</span><strong>{loading || error ? '—' : activeCustomers.length}</strong></article>
          <article><span>Pending confirmation</span><strong>{loading || error ? '—' : pendingCustomers.length}</strong></article>
          <article><span>Confirmed accounts</span><strong>{loading || error ? '—' : verifiedCustomers.length}</strong></article>
          <article><span>Total spent</span><strong>{loading || error ? '—' : formatCurrency(totalSpent)}</strong></article>
        </div>

        <div className="cater-tab-bar" aria-label="Customer management tabs">
          <button
            aria-pressed={activeTab === 'applications'}
            className={`cater-tab ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => setActiveTab('applications')}
            type="button"
          >
            Applications <span>{loading || error ? '—' : pendingCustomers.length}</span>
          </button>
          <button
            aria-pressed={activeTab === 'customers'}
            className={`cater-tab ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
            type="button"
          >
            Customers <span>{loading || error ? '—' : verifiedCustomers.length}</span>
          </button>
        </div>

        <section className="admin-users-directory" aria-label={activeTab === 'applications' ? 'Customer applications awaiting confirmation' : 'Confirmed customers'}>
          <div className="admin-users-toolbar admin-customer-toolbar">
            <input
              aria-label={activeTab === 'applications' ? 'Search customer applications' : 'Search customers'}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={activeTab === 'applications' ? 'Search applicants, email, phone, or location...' : 'Search customers, email, phone, or location...'}
              type="search"
              value={search}
            />
            <select aria-label="Sort customers" onChange={(event) => setSortOrder(event.target.value)} value={sortOrder}>
              <option value="newest">Newest first</option>
              <option value="name">Name: A–Z</option>
              <option value="spent">Highest total spent</option>
            </select>
          </div>

          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>{activeTab === 'applications' ? 'Applicant' : 'Customer'}</th><th>Contact</th><th>Location</th><th>Status</th><th>{activeTab === 'applications' ? 'Applied' : 'Joined'}</th><th>Bookings</th><th>Total spent</th>{activeTab === 'applications' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((customer, index) => (
                  <tr key={customer.customer_id}>
                    <td data-label={activeTab === 'applications' ? 'Applicant' : 'Customer'}>
                      <div className="admin-users-identity">
                        <span className={`admin-users-avatar tone-${index % 6}`}>{customer.full_name?.trim()?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                        <span><strong>{customer.full_name || 'Unnamed customer'}</strong><small>{customer.email || 'No email provided'}</small></span>
                      </div>
                    </td>
                    <td data-label="Contact">{customer.phone || '—'}</td>
                    <td data-label="Location">{[customer.city, customer.address].filter(Boolean).join(', ') || '—'}</td>
                    <td data-label="Status">
                      <span className={`admin-users-status state-${customer.is_verified ? 'active' : 'unverified'}`}>
                        {customer.is_verified ? 'Confirmed' : 'Pending'}
                      </span>
                    </td>
                    <td data-label={activeTab === 'applications' ? 'Applied' : 'Joined'}>{formatDate(customer.created_at)}</td>
                    <td data-label="Bookings">{customer.total_bookings ?? 0}</td>
                    <td data-label="Total spent">{formatCurrency(customer.total_spent)}</td>
                    {activeTab === 'applications' && (
                      <td data-label="Action">
                        <div className="admin-users-actions">
                          <button
                            className="admin-users-approve"
                            disabled={loading || savingCustomerId !== null}
                            onClick={() => confirmAccount(customer)}
                            type="button"
                          >
                            {savingCustomerId === customer.customer_id ? 'Confirming...' : 'Confirm account'}
                          </button>
                          <button
                            className="admin-users-reject"
                            disabled={loading || savingCustomerId !== null}
                            onClick={() => openRejectionForm(customer)}
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!pageCustomers.length && (
                  <tr><td className="admin-users-empty" colSpan={activeTab === 'applications' ? 8 : 7}>
                    {loading
                      ? <LoadingSpinner compact />
                      : error
                        ? 'Customer data is unavailable.'
                        : activeTab === 'applications'
                          ? <><UsersRound size={18} aria-hidden="true" /> No customer applications are waiting for confirmation.</>
                          : <><UsersRound size={18} aria-hidden="true" /> No customers match your search.</>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-users-pagination">
            <span>{error ? 'Customer data unavailable' : `Showing ${firstVisible}–${lastVisible} of ${visibleCustomers.length}`}</span>
            <div>
              <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">‹</button>
              <span>Page {page} of {pageCount}</span>
              <button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">›</button>
            </div>
          </div>
        </section>

        {rejectingCustomer && (
          <div
            className="account-reject-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Reject ${rejectingCustomer.full_name || 'customer'} application`}
            onClick={() => { if (savingCustomerId === null) setRejectingCustomer(null); }}
          >
            <form
              className="account-reject-form"
              onSubmit={rejectAccount}
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <p className="eyebrow">Reject application</p>
                  <h3>{rejectingCustomer.full_name || 'Customer'}</h3>
                  <p>This reason will be saved and shown to the customer when they try to sign in.</p>
                </div>
              </header>
              <label htmlFor="customer-account-rejection-reason">Reason for rejection</label>
              <textarea
                id="customer-account-rejection-reason"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength={500}
                minLength={5}
                required
                placeholder="Explain why this account application was rejected."
              />
              <div className="account-reject-footer">
                <span>{rejectionReason.trim().length}/500</span>
                <button
                  className="button button-secondary"
                  disabled={savingCustomerId !== null}
                  onClick={() => setRejectingCustomer(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button admin-button-muted"
                  disabled={rejectionReason.trim().length < 5 || savingCustomerId !== null}
                  type="submit"
                >
                  {savingCustomerId === rejectingCustomer.customer_id ? 'Rejecting...' : 'Reject account'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
