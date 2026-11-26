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
  const [search, setSearch] = useState('');
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

  const activeCustomers = customers.filter((customer) => !customer.rejection_reason);
  const rejectedCustomers = customers.filter((customer) => customer.rejection_reason);
  const totalSpent = activeCustomers.reduce((sum, customer) => sum + (Number(customer.total_spent) || 0), 0);
  const visibleCustomers = useMemo(() => customers
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
    }), [customers, search, sortOrder]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleCustomers.length / pageSize));
  const pageCustomers = visibleCustomers.slice((page - 1) * pageSize, page * pageSize);
  const firstVisible = visibleCustomers.length ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, visibleCustomers.length);

  useEffect(() => { setPage(1); }, [search, sortOrder]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);


  return (
    <DashboardPage role="admin" section="customer-management">
      <div className="admin-workspace admin-users-workspace">
        <div className="admin-intro admin-users-intro">
          <div>
            <p className="eyebrow">Super admin tools</p>
            <h2>Customer Management</h2>
            <p>Manage customer accounts and track booking and payment activity.</p>
          </div>
          <button className="admin-refresh" disabled={loading} onClick={() => load()} type="button">
            {loading ? <span className="loading-spinner loading-spinner-inline" role="status" aria-label="Refreshing" /> : 'Refresh data'}
          </button>
        </div>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}
        {notice && <p className="form-alert success-alert" role="status">{notice}</p>}

        <div className="admin-users-summary">
          <article><span>Total customers</span><strong>{loading || error ? '—' : customers.length}</strong></article>
          <article><span>Active accounts</span><strong>{loading || error ? '—' : activeCustomers.length}</strong></article>
          <article><span>Rejected accounts</span><strong>{loading || error ? '—' : rejectedCustomers.length}</strong></article>
          <article><span>Total spent</span><strong>{loading || error ? '—' : formatCurrency(totalSpent)}</strong></article>
        </div>

        <section className="admin-users-directory" aria-label="Customer directory">
          <div className="admin-users-toolbar admin-customer-toolbar">
            <input
              aria-label="Search customers"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers, email, phone, or location..."
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
                  <th>Customer</th><th>Contact</th><th>Location</th><th>Status</th><th>Joined</th><th>Bookings</th><th>Total spent</th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((customer, index) => (
                  <tr key={customer.customer_id}>
                    <td data-label="Customer">
                      <div className="admin-users-identity">
                        <span className={`admin-users-avatar tone-${index % 6}`}>{customer.full_name?.trim()?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                        <span><strong>{customer.full_name || 'Unnamed customer'}</strong><small>{customer.email || 'No email provided'}</small></span>
                      </div>
                    </td>
                    <td data-label="Contact">{customer.phone || '—'}</td>
                    <td data-label="Location">{[customer.city, customer.address].filter(Boolean).join(', ') || '—'}</td>
                    <td data-label="Status">
                      <span className={`admin-users-status state-${customer.rejection_reason ? 'rejected' : 'active'}`}>
                        {customer.rejection_reason ? 'Rejected' : 'Active'}
                      </span>
                    </td>
                    <td data-label="Joined">{formatDate(customer.created_at)}</td>
                    <td data-label="Bookings">{customer.total_bookings ?? 0}</td>
                    <td data-label="Total spent">{formatCurrency(customer.total_spent)}</td>
                  </tr>
                ))}
                {!pageCustomers.length && (
                  <tr><td className="admin-users-empty" colSpan="7">
                    {loading
                      ? <LoadingSpinner compact />
                      : error
                        ? 'Customer data is unavailable.'
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
      </div>
    </DashboardPage>
  );
}
