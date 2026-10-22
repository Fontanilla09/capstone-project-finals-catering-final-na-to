import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, List, X, ZoomIn, ZoomOut } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';
import { EVENT_TYPES } from '../lib/eventTypes';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const subscriptionDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};
const packageEventThemes = {
  anniversary: { icon: '💞', color: 'rose' },
  birthday: { icon: '🎂', color: 'orange' },
  christening: { icon: '🍼', color: 'blue' },
  corporate: { icon: '💼', color: 'slate' },
  debut: { icon: '👗', color: 'violet' },
  graduation: { icon: '🎓', color: 'teal' },
  wedding: { icon: '💍', color: 'sage' },
};

function packageEventTheme(eventType) {
  return packageEventThemes[eventType?.trim().toLocaleLowerCase()] || { icon: '✨', color: 'gold' };
}

function packageImageUrl(path) {
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

export default function AdminCaterManagement() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [verifiedCaterers, setVerifiedCaterers] = useState([]);
  const [verifiedCatererCount, setVerifiedCatererCount] = useState(0);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [packages, setPackages] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [activeTab, setActiveTab] = useState('applications');
  const [packageSearch, setPackageSearch] = useState('');
  const [packageSort, setPackageSort] = useState('newest');
  const [packageView, setPackageView] = useState('cards');
  const [catererSearch, setCatererSearch] = useState('');
  const [catererStatusFilter, setCatererStatusFilter] = useState('all');
  const [catererCityFilter, setCatererCityFilter] = useState('all');
  const [catererSort, setCatererSort] = useState('name-asc');
  const [selectedCatererId, setSelectedCatererId] = useState(null);
  const [restrictionTarget, setRestrictionTarget] = useState(null);
  const [restrictionReason, setRestrictionReason] = useState('');
  const [savingRestriction, setSavingRestriction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [rejectingAccount, setRejectingAccount] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [permitPreview, setPermitPreview] = useState(null);
  const [permitZoom, setPermitZoom] = useState(1);

  async function load() {
    setLoading(true);
    setError('');
    const [accountsResult, packagesResult, caterersResult, subscriptionsResult] = await Promise.all([
      supabase.rpc('get_admin_accounts'),
      supabase
        .from('packages')
        .select('id, caterer_id, package_name, event_type, price, guest_count_min, guest_count_max, description, created_at, package_images(image_path), caterers!inner(business_name, is_verified)')
        .eq('caterers.is_verified', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('caterers')
        .select('id, business_name, phone, address, city, is_verified, is_suspended, suspension_reason, created_at, business_permit, rating')
        .eq('is_verified', true)
        .order('business_name', { ascending: true }),
      supabase.rpc('get_admin_caterer_subscriptions'),
    ]);

    const errors = [];
    const accounts = accountsResult.data || [];
    if (accountsResult.error) {
      errors.push(`Unable to load caterer approvals: ${accountsResult.error.message}`);
    } else {
      const pending = accounts.filter((account) =>
        account.role === 'caterer'
        && account.caterer_verification_submitted === true
        && !account.caterer_verified
        && !account.rejection_reason,
      );
      setPendingApprovals(pending);
      setVerifiedCatererCount(accounts.filter((account) => account.role === 'caterer' && account.caterer_verified).length);
    }

    if (caterersResult.error) {
      errors.push(`Unable to load verified caterers: ${caterersResult.error.message}`);
    } else {
      const accountByCatererId = new Map(
        accounts
          .filter((account) => account.role === 'caterer' && account.caterer_id)
          .map((account) => [String(account.caterer_id), account]),
      );
      const packageCounts = new Map();
      (packagesResult.data || []).forEach((item) => {
        const id = String(item.caterer_id);
        packageCounts.set(id, (packageCounts.get(id) || 0) + 1);
      });
      setVerifiedCaterers((caterersResult.data || []).map((caterer) => {
        const account = accountByCatererId.get(String(caterer.id));
        return {
          ...caterer,
          email: account?.email || 'No email provided',
          contact_person: account?.contact_person || account?.full_name || 'Not provided',
          package_count: packageCounts.get(String(caterer.id)) || 0,
        };
      }));
    }

    if (packagesResult.error) {
      errors.push(`Unable to load packages: ${packagesResult.error.message}`);
    } else {
      setPackages(packagesResult.data || []);
    }
    if (subscriptionsResult.error) {
      errors.push(`Unable to load caterer subscriptions: ${subscriptionsResult.error.message}`);
    } else {
      setSubscriptions(subscriptionsResult.data || []);
    }
    setError(errors.join(' '));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!permitPreview) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setPermitPreview(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [permitPreview]);

  function requestRejection(account) {
    setRejectingAccount({
      id: account.caterer_id ?? account.id,
      name: account.business_name || account.name || 'Caterer',
    });
    setRejectionReason('');
    setError('');
  }

  async function decideCaterer(action, catererProfileId) {
    try {
      const { error } = await supabase.rpc('set_caterer_verification', {
        caterer_id: catererProfileId,
        approved: action === 'approve_caterer',
        p_rejection_reason: null,
      });
      if (error) throw error;
      setError('Caterer verification updated.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Unable to update caterer approval.');
    }
  }

  async function updateCatererSuspension(caterer, shouldSuspend) {
    const reason = restrictionReason.trim();
    if (shouldSuspend && reason.length < 5) {
      setError('Enter a suspension reason of at least 5 characters.');
      return;
    }
    setSavingRestriction(true);
    setError('');
    try {
      const { error } = await supabase.rpc('set_caterer_suspension', {
        p_caterer_id: caterer.id,
        p_is_suspended: shouldSuspend,
        p_reason: shouldSuspend ? reason : null,
      });
      if (error) throw error;
      setRestrictionTarget(null);
      setRestrictionReason('');
      setSelectedCatererId(null);
      setError(shouldSuspend ? 'Caterer suspended.' : 'Caterer reactivated.');
      await load();
    } catch (reasonError) {
      setError(reasonError.message || 'Unable to update the caterer status.');
    } finally {
      setSavingRestriction(false);
    }
  }

  async function submitRejection(event) {
    event.preventDefault();
    if (!rejectingAccount) return;

    const reason = rejectionReason.trim();
    if (reason.length < 5) {
      setError('Please enter a reason of at least 5 characters.');
      return;
    }

    try {
      const { error } = await supabase.rpc('set_caterer_verification', {
        caterer_id: rejectingAccount.id,
        approved: false,
        p_rejection_reason: reason,
      });
      if (error) throw error;

      setRejectingAccount(null);
      setRejectionReason('');
      try {
        await supabase.functions.invoke('send-account-rejection-email', {
          body: { accountType: 'caterer', accountProfileId: rejectingAccount.id },
        });
      } catch (deliveryError) {
        setError(`Caterer rejected and the reason was saved, but the email could not be sent: ${deliveryError.message || 'Unexpected delivery error.'}`);
      }
      setError('Caterer rejected. The reason was saved.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Unable to reject the caterer.');
    }
  }

  async function openPermit(path) {
    if (!path || typeof path !== 'string' || path.trim() === '') return;
    const trimmed = path.trim();
    let signedUrl = trimmed;

    if (!(trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
      const { data, error } = await supabase.storage.from('permits').createSignedUrl(trimmed, 3600);
      if (error || !data?.signedUrl) {
        setError(error?.message || 'Unable to open the business permit.');
        return;
      }
      signedUrl = data.signedUrl;
    }

    const filePath = decodeURIComponent(signedUrl.split('?')[0]).toLowerCase();
    setPermitZoom(1);
    setPermitPreview({ url: signedUrl, isPdf: filePath.endsWith('.pdf') });
  }

  const packageCategoryCounts = useMemo(() => {
    const counts = new Map();
    packages.forEach((item) => {
      const eventType = item.event_type?.trim() || 'Other';
      if (eventType) counts.set(eventType, (counts.get(eventType) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const firstIndex = EVENT_TYPES.findIndex((eventType) => eventType.toLocaleLowerCase() === a.name.toLocaleLowerCase());
        const secondIndex = EVENT_TYPES.findIndex((eventType) => eventType.toLocaleLowerCase() === b.name.toLocaleLowerCase());
        if (firstIndex !== -1 || secondIndex !== -1) {
          return (firstIndex === -1 ? EVENT_TYPES.length : firstIndex) - (secondIndex === -1 ? EVENT_TYPES.length : secondIndex);
        }
        return a.name.localeCompare(b.name);
      });
  }, [packages]);
  const visiblePackages = packages
    .filter((item) => {
      const search = packageSearch.trim().toLocaleLowerCase();
      const eventType = item.event_type?.trim() || 'Other';
      const matchesCategory = !selectedTheme || eventType.toLocaleLowerCase() === selectedTheme.toLocaleLowerCase();
      const matchesSearch = !search || [
        item.package_name,
        item.caterers?.business_name,
        eventType,
      ].some((value) => value?.toLocaleLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    })
    .sort((first, second) => {
      if (packageSort === 'price-low') return Number(first.price) - Number(second.price);
      if (packageSort === 'price-high') return Number(second.price) - Number(first.price);
      if (packageSort === 'name') return first.package_name.localeCompare(second.package_name);
      return new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime();
    });

  const applications = pendingApprovals.map((account, index) => ({
    id: account.id ?? index,
    profileId: account.caterer_id ?? account.id,
    name: account.business_name || `Applicant ${index + 1}`,
    owner: account.contact_person || account.full_name || 'Owner',
    city: account.city || 'Not specified',
    docs: Number(Boolean(account.business_permit)),
    submitted: account.created_at ? new Date(account.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
    permitPath: account.business_permit || null,
    email: account.email || 'No email provided',
    phone: account.phone || 'Not provided',
    address: account.address || 'Not provided',
    category: account.event_type || 'Not specified',
    color: ['dark', 'green', 'purple', 'blue', 'red'][index % 5],
  }));

  const catererAccounts = new Map(
    verifiedCaterers.map((caterer) => [caterer.id, caterer]),
  );
  const selectedCaterer = catererAccounts.get(selectedCatererId) || null;
  const catererCities = [...new Set(verifiedCaterers.map((caterer) => caterer.city).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  const visibleCaterers = verifiedCaterers
    .filter((caterer) => {
      const search = catererSearch.trim().toLocaleLowerCase();
      const matchesSearch = !search || [
        caterer.business_name,
        caterer.contact_person,
        caterer.city,
      ].some((value) => value?.toLocaleLowerCase().includes(search));
      const matchesStatus = catererStatusFilter === 'all'
        || (catererStatusFilter === 'suspended' ? caterer.is_suspended : !caterer.is_suspended);
      const matchesCity = catererCityFilter === 'all' || caterer.city === catererCityFilter;
      return matchesSearch && matchesStatus && matchesCity;
    })
    .sort((first, second) => {
      if (catererSort === 'name-desc') return second.business_name.localeCompare(first.business_name);
      if (catererSort === 'rating-desc') return Number(second.rating || 0) - Number(first.rating || 0);
      return first.business_name.localeCompare(second.business_name);
    });
  const visibleSubscriptions = subscriptions
    .map((subscription) => {
      const isExpired = subscription.status === 'expired'
        || (subscription.status === 'active'
          && (!subscription.expires_at || Date.parse(subscription.expires_at) <= currentTime));
      return {
        ...subscription,
        displayStatus: isExpired ? 'expired' : subscription.status,
      };
    })
    .filter((subscription) => {
      const search = subscriptionSearch.trim().toLocaleLowerCase();
      const matchesSearch = !search || [
        subscription.business_name,
        subscription.email,
      ].some((value) => value?.toLocaleLowerCase().includes(search));
      const matchesStatus = subscriptionStatusFilter === 'all'
        || subscription.displayStatus === subscriptionStatusFilter;
      return matchesSearch && matchesStatus;
    });

  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const selectedApplication = applications.find((application) => application.id === selectedApplicationId) || null;

  useEffect(() => {
    if (!applications.length) {
      if (selectedApplicationId !== null) setSelectedApplicationId(null);
      return;
    }
    if (selectedApplicationId !== null && !applications.some((application) => application.id === selectedApplicationId)) {
      setSelectedApplicationId(applications[0].id);
    }
  }, [applications, selectedApplicationId]);

  useEffect(() => {
    if (!selectedApplication) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedApplicationId(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedApplication]);

  useEffect(() => {
    if (!selectedCaterer) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedCatererId(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedCaterer]);

  useEffect(() => {
    if (!restrictionTarget) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !savingRestriction) setRestrictionTarget(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [restrictionTarget, savingRestriction]);

  return (
    <DashboardPage role="admin" section="cater-management">
      <div className="admin-workspace cater-management">
        <div className="cater-management-header">
          <div>
            <h2>Cater Management</h2>
            <p>Review applications, manage verified partners, and keep package offerings organized.</p>
          </div>
          <button className="admin-refresh" onClick={load} type="button" disabled={loading}>
            {loading ? <span className="loading-spinner loading-spinner-inline" role="status" aria-label="Refreshing" /> : 'Refresh data'}
          </button>
        </div>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}

        <div className="cater-summary-grid">
          <div className="cater-summary-card">
            <span>Pending applications</span>
            <strong>{loading ? '—' : String(pendingApprovals.length)}</strong>
          </div>
          <div className="cater-summary-card">
            <span>Verified caterers</span>
            <strong>{loading ? '—' : String(verifiedCatererCount)}</strong>
          </div>
          <div className="cater-summary-card">
            <span>Missing permits</span>
            <strong>{loading ? '—' : String(pendingApprovals.filter((account) => !account.business_permit).length)}</strong>
          </div>
          <div className="cater-summary-card">
            <span>Packages</span>
            <strong>{loading ? '—' : String(packages.length)}</strong>
          </div>
        </div>

        <div className="cater-tab-bar" aria-label="Cater management tabs">
          <button className={`cater-tab ${activeTab === 'applications' ? 'active' : ''}`} onClick={() => { setActiveTab('applications'); setSelectedApplicationId(null); setSelectedCatererId(null); }} type="button">Applications <span>{pendingApprovals.length}</span></button>
          <button className={`cater-tab ${activeTab === 'caterers' ? 'active' : ''}`} onClick={() => { setActiveTab('caterers'); setSelectedApplicationId(null); setSelectedCatererId(null); }} type="button">Caterers <span>{verifiedCatererCount}</span></button>
          <button className={`cater-tab ${activeTab === 'subscriptions' ? 'active' : ''}`} onClick={() => { setActiveTab('subscriptions'); setSelectedApplicationId(null); setSelectedCatererId(null); }} type="button">Subscriptions <span>{subscriptions.length}</span></button>
          <button className={`cater-tab ${activeTab === 'packages' ? 'active' : ''}`} onClick={() => { setActiveTab('packages'); setSelectedApplicationId(null); setSelectedCatererId(null); }} type="button">Packages <span>{packages.length}</span></button>
        </div>

        {activeTab === 'applications' && (
          <div className="cater-management-layout">
            <div className="cater-table-panel">
              <div className="cater-table-toolbar">
                <input aria-label="Search application" className="cater-search" placeholder="Search applicant, owner, city..." type="text" />
              </div>
              <div className="cater-applications-table">
                <div className="cater-table-header">
                  <div className="cater-select-header"><input type="checkbox" aria-label="Select all" /></div>
                  <div className="cater-column-name">Caterer</div>
                  <div className="cater-column-city">City</div>
                  <div className="cater-column-docs">Docs</div>
                  <div className="cater-column-submitted">Submitted</div>
                  <div className="cater-column-actions" />
                </div>
                {applications.length ? applications.map((application) => (
                  <div className="cater-table-row" key={application.id}>
                    <div className="cater-select-cell"><input type="checkbox" aria-label={`Select ${application.name}`} /></div>
                    <div className="cater-name-cell">
                      <span className={`cater-avatar ${application.color}`}>{application.name.charAt(0).toUpperCase()}</span>
                      <div><strong>{application.name}</strong><small>{application.owner}</small></div>
                    </div>
                    <div className="cater-city-cell">{application.city}</div>
                    <div className="cater-docs-cell"><span className="cater-doc-pill">{application.docs} file{application.docs === 1 ? '' : 's'}</span></div>
                    <div className="cater-submitted-cell">{application.submitted}</div>
                    <div className="cater-action-cell">
                      <button className="cater-action view" onClick={() => setSelectedApplicationId(application.id)} type="button">View</button>
                      <button className="cater-action reject" onClick={() => requestRejection({ id: application.profileId, business_name: application.name })} type="button">Reject</button>
                      <button className="cater-action approve" onClick={() => decideCaterer('approve_caterer', application.profileId)} type="button">Approve</button>
                    </div>
                  </div>
                )) : loading ? <LoadingSpinner compact /> : <p className="cater-empty-state">No caterer applications are waiting for review.</p>}
              </div>
            </div>
            {selectedApplication && (
              <div className="cater-detail-overlay" role="dialog" aria-modal="true" aria-label={`Application details for ${selectedApplication.name}`} onClick={() => setSelectedApplicationId(null)}>
                <aside className="cater-detail-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="cater-detail-header"><button className="cater-detail-close" onClick={() => setSelectedApplicationId(null)} type="button">× Close</button></div>
                  <div className="cater-detail-profile">
                    <div className={`cater-avatar large ${selectedApplication.color}`}>{selectedApplication.name.charAt(0).toUpperCase()}</div>
                    <h3>{selectedApplication.name}</h3>
                    <div className="cater-status-row"><span className="cater-badge pending">Pending</span><span className="cater-badge muted">{selectedApplication.category}</span></div>
                  </div>
                  <div className="cater-detail-grid">
                    <div className="cater-detail-field"><label>Owner</label><div>{selectedApplication.owner}</div></div>
                    <div className="cater-detail-field"><label>Phone</label><div>{selectedApplication.phone}</div></div>
                    <div className="cater-detail-field full-width"><label>Email</label><div>{selectedApplication.email}</div></div>
                    <div className="cater-detail-field full-width"><label>Business address</label><div>{selectedApplication.address}</div></div>
                    <div className="cater-detail-field full-width"><label>Submitted</label><div>{selectedApplication.submitted}</div></div>
                  </div>
                  {!selectedApplication.permitPath && <div className="cater-alert-banner"><span>⚠</span><p>No business permit was submitted with this application.</p></div>}
                  <div className="cater-doc-section">
                    <h4>Permits &amp; documents</h4>
                    <div className="cater-doc-status-row">
                      <div><strong>Business permit</strong><small>{selectedApplication.permitPath ? 'Uploaded with this application' : 'No file uploaded'}</small></div>
                      <div className="cater-doc-actions">
                        <span className={`cater-status-pill ${selectedApplication.permitPath ? 'ok' : 'muted'}`}>{selectedApplication.permitPath ? 'Uploaded' : 'Not submitted'}</span>
                        {selectedApplication.permitPath && <button className="cater-action view" onClick={() => openPermit(selectedApplication.permitPath)} type="button">View permit</button>}
                      </div>
                    </div>
                  </div>
                  <div className="cater-detail-footer">
                    <button className="cater-action reject" onClick={() => { setSelectedApplicationId(null); requestRejection({ id: selectedApplication.profileId, business_name: selectedApplication.name }); }} type="button">Reject</button>
                    <button className="cater-action approve" onClick={() => { setSelectedApplicationId(null); decideCaterer('approve_caterer', selectedApplication.profileId); }} type="button">Approve caterer</button>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {activeTab === 'caterers' && (
          <section className="cater-directory" aria-label="Verified caterers">
            <div className="cater-directory-toolbar">
              <input aria-label="Search caterer or owner" className="cater-search" onChange={(event) => setCatererSearch(event.target.value)} placeholder="Search caterer or owner..." type="search" value={catererSearch} />
              <select aria-label="Filter by status" onChange={(event) => setCatererStatusFilter(event.target.value)} value={catererStatusFilter}>
                <option value="all">All status</option><option value="verified">Verified</option><option value="suspended">Suspended</option>
              </select>
              <select aria-label="Filter by city" onChange={(event) => setCatererCityFilter(event.target.value)} value={catererCityFilter}>
                <option value="all">All cities</option>{catererCities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
              <select aria-label="Sort caterers" onChange={(event) => setCatererSort(event.target.value)} value={catererSort}>
                <option value="name-asc">Sort: A–Z</option><option value="name-desc">Sort: Z–A</option><option value="rating-desc">Sort: Rating</option>
              </select>
            </div>
            <div className="cater-applications-table cater-directory-table">
              <div className="cater-directory-header"><span>Caterer</span><span>City</span><span>Packages</span><span>Rating</span><span>Status</span><span aria-hidden="true" /></div>
              {visibleCaterers.length ? visibleCaterers.map((caterer, index) => (
                <div className="cater-directory-row" key={caterer.id}>
                  <div className="cater-name-cell"><span className={`cater-avatar ${['green', 'blue', 'purple', 'red', 'dark'][index % 5]}`}>{caterer.business_name?.charAt(0)?.toUpperCase() || 'C'}</span><div><strong>{caterer.business_name}</strong><small>{caterer.contact_person}</small></div></div>
                  <span className="cater-city-cell">{caterer.city || 'Not specified'}</span>
                  <span>{caterer.package_count}</span>
                  <span className="cater-rating">{Number(caterer.rating) > 0 ? `★ ${Number(caterer.rating).toFixed(1)}` : '—'}</span>
                  <span><span className={`cater-badge ${caterer.is_suspended ? 'suspended' : 'verified'}`}>{caterer.is_suspended ? 'Suspended' : 'Verified'}</span></span>
                  <div className="cater-action-cell">
                    <button className="cater-action view" onClick={() => setSelectedCatererId(caterer.id)} type="button">View</button>
                    <button className={`cater-action ${caterer.is_suspended ? 'approve' : 'reject'}`} onClick={() => { if (caterer.is_suspended) updateCatererSuspension(caterer, false); else { setRestrictionTarget(caterer); setRestrictionReason(''); } }} type="button">{caterer.is_suspended ? 'Reactivate' : 'Suspend'}</button>
                  </div>
                </div>
              )) : loading ? <LoadingSpinner compact /> : <p className="cater-empty-state">No verified caterers match these filters.</p>}
            </div>
            {selectedCaterer && (
              <div className="cater-detail-overlay" role="dialog" aria-modal="true" aria-label={`Caterer details for ${selectedCaterer.business_name}`} onClick={() => setSelectedCatererId(null)}>
                <aside className="cater-detail-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="cater-detail-header"><button className="cater-detail-close" onClick={() => setSelectedCatererId(null)} type="button">× Close</button></div>
                  <div className="cater-detail-profile">
                    <div className="cater-avatar large green">{selectedCaterer.business_name?.charAt(0)?.toUpperCase() || 'C'}</div>
                    <h3>{selectedCaterer.business_name}</h3>
                    <div className="cater-status-row">
                      <span className={`cater-badge ${selectedCaterer.is_suspended ? 'suspended' : 'verified'}`}>{selectedCaterer.is_suspended ? 'Suspended' : 'Verified'}</span>
                      <span className="cater-badge muted">{selectedCaterer.package_count} packages</span>
                    </div>
                  </div>
                  <div className="cater-detail-grid">
                    <div className="cater-detail-field"><label>Owner</label><div>{selectedCaterer.contact_person}</div></div>
                    <div className="cater-detail-field"><label>Phone</label><div>{selectedCaterer.phone || 'Not provided'}</div></div>
                    <div className="cater-detail-field full-width"><label>Email</label><div>{selectedCaterer.email}</div></div>
                    <div className="cater-detail-field full-width"><label>Business address</label><div>{selectedCaterer.address || 'Not provided'}</div></div>
                    <div className="cater-detail-field"><label>Joined</label><div>{selectedCaterer.created_at ? new Date(selectedCaterer.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'}</div></div>
                    <div className="cater-detail-field"><label>Rating</label><div>{Number(selectedCaterer.rating) > 0 ? `★ ${Number(selectedCaterer.rating).toFixed(1)}` : 'No ratings yet'}</div></div>
                  </div>
                  <div className="cater-doc-section">
                    <h4>Permits &amp; documents</h4>
                    <div className="cater-doc-status-row">
                      <div><strong>Business permit</strong><small>{selectedCaterer.business_permit ? 'Uploaded' : 'No file uploaded'}</small></div>
                      <div className="cater-doc-actions">
                        <span className={`cater-status-pill ${selectedCaterer.business_permit ? 'ok' : 'muted'}`}>{selectedCaterer.business_permit ? 'Uploaded' : 'Not submitted'}</span>
                        {selectedCaterer.business_permit && <button className="cater-action view" onClick={() => openPermit(selectedCaterer.business_permit)} type="button">View</button>}
                      </div>
                    </div>
                  </div>
                  {selectedCaterer.suspension_reason && <p className="cater-suspension-reason"><strong>Suspension reason:</strong> {selectedCaterer.suspension_reason}</p>}
                  <div className="cater-detail-footer">
                    <button className={`cater-action ${selectedCaterer.is_suspended ? 'approve' : 'reject'}`} onClick={() => {
                      if (selectedCaterer.is_suspended) updateCatererSuspension(selectedCaterer, false);
                      else { setSelectedCatererId(null); setRestrictionTarget(selectedCaterer); setRestrictionReason(''); }
                    }} type="button">{selectedCaterer.is_suspended ? 'Reactivate caterer' : 'Suspend caterer'}</button>
                  </div>
                </aside>
              </div>
            )}
          </section>
        )}

        {activeTab === 'subscriptions' && (
          <section className="subscription-directory" aria-label="Caterer subscriptions">
            <div className="subscription-toolbar">
              <input
                aria-label="Search subscriptions"
                className="cater-search"
                onChange={(event) => setSubscriptionSearch(event.target.value)}
                placeholder="Search caterer or email..."
                type="search"
                value={subscriptionSearch}
              />
              <select
                aria-label="Filter subscriptions by status"
                onChange={(event) => setSubscriptionStatusFilter(event.target.value)}
                value={subscriptionStatusFilter}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="subscription-table" role="table" aria-label="Subscription records">
              <div className="subscription-table-header" role="row">
                <span role="columnheader">Caterer</span>
                <span role="columnheader">Plan</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Started</span>
                <span role="columnheader">Expires</span>
                <span role="columnheader">Status</span>
              </div>
              {visibleSubscriptions.length ? visibleSubscriptions.map((subscription) => (
                <div className="subscription-table-row" key={subscription.subscription_id} role="row">
                  <div className="cater-name-cell" role="cell">
                    <strong>{subscription.business_name || 'Caterer account'}</strong>
                    <small>{subscription.email || 'No email provided'}</small>
                  </div>
                  <span data-label="Plan" role="cell">{subscription.plan === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                  <span data-label="Amount" role="cell">{money(subscription.amount)}</span>
                  <span data-label="Started" role="cell">{subscriptionDate(subscription.started_at)}</span>
                  <span data-label="Expires" role="cell">{subscriptionDate(subscription.expires_at)}</span>
                  <span data-label="Status" role="cell">
                    <span className={`cater-badge ${subscription.displayStatus === 'active' ? 'verified' : subscription.displayStatus === 'expired' ? 'suspended' : subscription.displayStatus === 'pending' ? 'pending' : 'muted'}`}>
                      {subscription.displayStatus || 'Unknown'}
                    </span>
                  </span>
                </div>
              )) : loading ? <LoadingSpinner compact /> : (
                <p className="cater-empty-state">
                  {subscriptions.length ? 'No subscriptions match these filters.' : 'No caterer subscriptions have been recorded yet.'}
                </p>
              )}
            </div>
          </section>
        )}

        {activeTab === 'packages' && (
          <section className="admin-package-directory" aria-label="Catering packages">
            <div className="admin-package-toolbar">
              <input aria-label="Search package or caterer" className="cater-search" onChange={(event) => setPackageSearch(event.target.value)} placeholder="Search package or caterer..." type="search" value={packageSearch} />
              <select aria-label="Sort packages" onChange={(event) => setPackageSort(event.target.value)} value={packageSort}>
                <option value="newest">Newest</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="name">Name: A–Z</option>
              </select>
              <div className="admin-package-view-toggle" role="group" aria-label="Package display">
                <button aria-label="Card view" aria-pressed={packageView === 'cards'} className={packageView === 'cards' ? 'active' : ''} onClick={() => setPackageView('cards')} type="button"><Grid2X2 size={16} /> Cards</button>
                <button aria-label="Table view" aria-pressed={packageView === 'table'} className={packageView === 'table' ? 'active' : ''} onClick={() => setPackageView('table')} type="button"><List size={16} /> Table</button>
              </div>
            </div>

            <div className="admin-package-categories" role="group" aria-label="Filter packages by event type">
              <button aria-pressed={!selectedTheme} className={!selectedTheme ? 'active' : ''} onClick={() => setSelectedTheme('')} type="button">All <span>{packages.length}</span></button>
              {packageCategoryCounts.map(({ name, count }) => (
                <button aria-pressed={selectedTheme?.toLocaleLowerCase() === name.toLocaleLowerCase()} className={selectedTheme?.toLocaleLowerCase() === name.toLocaleLowerCase() ? 'active' : ''} key={name} onClick={() => setSelectedTheme(name)} type="button">{name} <span>{count}</span></button>
              ))}
            </div>

            {visiblePackages.length ? packageView === 'cards' ? (
              <div className="admin-package-grid">
                {visiblePackages.map((item) => {
                  const theme = packageEventTheme(item.event_type);
                  return (
                    <article className="admin-package-card" key={item.id}>
                      <div className={`admin-package-card-banner ${theme.color}`}>
                        {item.package_images?.[0]?.image_path
                          ? <img src={packageImageUrl(item.package_images[0].image_path)} alt={`${item.package_name} package`} />
                          : <span aria-hidden="true">{theme.icon}</span>}
                      </div>
                      <div className="admin-package-card-content">
                        <span className="admin-package-event">{item.event_type || 'Other'}</span>
                        <h3>{item.package_name}</h3>
                        <p className="admin-package-caterer">{item.caterers?.business_name || 'Caterer not specified'}</p>
                        <p className="admin-package-guests"><span aria-hidden="true">♟</span> {item.guest_count_min || 0}–{item.guest_count_max || 0} guests</p>
                        <strong className="admin-package-price">{money(item.price)} <small>per package</small></strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="admin-package-table-wrap">
                <table className="admin-package-table">
                  <thead><tr><th>Photo</th><th>Package</th><th>Event type</th><th>Caterer</th><th>Guest range</th><th>Price</th></tr></thead>
                  <tbody>
                    {visiblePackages.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Photo">{item.package_images?.[0]?.image_path ? <img className="admin-package-table-image" src={packageImageUrl(item.package_images[0].image_path)} alt={`${item.package_name} package`} /> : <span className="admin-package-table-image-empty">No photo</span>}</td>
                        <td data-label="Package"><strong>{item.package_name}</strong></td>
                        <td data-label="Event type">{item.event_type || 'Other'}</td>
                        <td data-label="Caterer">{item.caterers?.business_name || 'Caterer not specified'}</td>
                        <td data-label="Guest range">{item.guest_count_min || 0}–{item.guest_count_max || 0}</td>
                        <td data-label="Price">{money(item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : loading ? <LoadingSpinner compact /> : <p className="cater-empty-state">No packages match your search or category.</p>}
          </section>
        )}

        {restrictionTarget && (
          createPortal(
            <div className="cater-restriction-overlay" role="dialog" aria-modal="true" aria-label={`Suspend ${restrictionTarget.business_name}`} onClick={() => !savingRestriction && setRestrictionTarget(null)}>
              <form className="cater-restriction-form" onSubmit={(event) => { event.preventDefault(); updateCatererSuspension(restrictionTarget, true); }} onClick={(event) => event.stopPropagation()}>
                <p className="eyebrow">Caterer account</p>
                <h3>Suspend {restrictionTarget.business_name}?</h3>
                <p>The caterer will no longer be able to use their account until it is reactivated.</p>
                <label htmlFor="cater-suspension-reason">Reason for suspension</label>
                <textarea id="cater-suspension-reason" value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} maxLength={500} minLength={5} required placeholder="Explain why this caterer is being suspended." />
                <div className="cater-restriction-footer">
                  <span>{restrictionReason.trim().length}/500</span>
                  <button className="button button-secondary" onClick={() => setRestrictionTarget(null)} disabled={savingRestriction} type="button">Cancel</button>
                  <button className="button admin-button-muted" disabled={restrictionReason.trim().length < 5 || savingRestriction} type="submit">{savingRestriction ? 'Suspending...' : 'Suspend caterer'}</button>
                </div>
              </form>
            </div>,
            document.body,
          )
        )}

        {rejectingAccount && (
          <div className="account-reject-overlay" role="dialog" aria-modal="true" aria-label={`Reject ${rejectingAccount.name}`} onClick={() => setRejectingAccount(null)}>
            <form className="account-reject-form" onSubmit={submitRejection} onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <p className="eyebrow">Reject account</p>
                  <h3>{rejectingAccount.name}</h3>
                  <p>This reason will be shown to the caterer when they try to sign in again.</p>
                </div>
              </header>
              <label htmlFor="account-rejection-reason">Reason for rejection</label>
              <textarea id="account-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} minLength={5} required placeholder="Explain why this account was rejected." />
              <div className="account-reject-footer">
                <span>{rejectionReason.trim().length}/500</span>
                <button className="button button-secondary" onClick={() => setRejectingAccount(null)} type="button">Cancel</button>
                <button className="button admin-button-muted" disabled={rejectionReason.trim().length < 5} type="submit">Reject account</button>
              </div>
            </form>
          </div>
        )}

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
      </div>
    </DashboardPage>
  );
}
