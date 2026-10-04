import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { EVENT_TYPES } from '../lib/eventTypes';
import DashboardPage from '../components/DashboardPage.jsx';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function AdminCaterManagement() {
  const [pendingCaterers, setPendingCaterers] = useState(0);
  const [packages, setPackages] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const [accountsResult, packagesResult] = await Promise.all([
      supabase.rpc('get_admin_accounts'),
      supabase
        .from('packages')
        .select('id, package_name, event_type, price, guest_count_min, guest_count_max, description, caterers!inner(business_name, is_verified)')
        .eq('caterers.is_verified', true)
        .order('id', { ascending: false }),
    ]);

    const errors = [];
    if (accountsResult.error) {
      errors.push(`Unable to load caterer approvals: ${accountsResult.error.message}`);
    } else {
      const pending = (accountsResult.data || []).filter((account) =>
        account.role === 'caterer'
        && account.caterer_verification_submitted === true
        && !account.caterer_verified
        && !account.rejection_reason,
      );
      setPendingCaterers(pending.length);
    }

    if (packagesResult.error) {
      errors.push(`Unable to load packages: ${packagesResult.error.message}`);
    } else {
      setPackages(packagesResult.data || []);
    }
    setError(errors.join(' '));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const themeCounts = useMemo(() => {
    const counts = new Map();
    packages.forEach((item) => {
      const eventType = item.event_type?.trim();
      if (eventType) counts.set(eventType, (counts.get(eventType) || 0) + 1);
    });
    return [...new Set([...EVENT_TYPES, ...counts.keys()])]
      .map((name) => ({ name, count: counts.get(name) || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [packages]);
  const visiblePackages = selectedTheme
    ? packages.filter((item) => item.event_type?.trim() === selectedTheme)
    : packages;

  return (
    <DashboardPage role="admin" section="cater-management">
      <div className="admin-workspace cater-management">
        <div className="admin-intro">
          <div>
            <p className="eyebrow">Caterer operations</p>
            <h2>Cater Management</h2>
            <p>Review caterer applications, approve trusted partners, and keep package offerings organized.</p>
          </div>
          <button className="admin-refresh" onClick={load} type="button" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>

        {error && <p className="form-alert error-alert" role="alert">{error}</p>}

        <div className="cater-management-actions">
          <a className="cater-management-action" href="/dashboard/admin/users#caterer-approvals">
            <span className="cater-management-action-icon" aria-hidden="true">✓</span>
            <span><strong>Review &amp; approve caterers</strong><small>{loading ? 'Loading applications...' : `${pendingCaterers} application${pendingCaterers === 1 ? '' : 's'} waiting for review`}</small></span>
            <span className="cater-management-arrow" aria-hidden="true">↗</span>
          </a>
          <a className="cater-management-action" href="#package-review">
            <span className="cater-management-action-icon" aria-hidden="true">▦</span>
            <span><strong>Review packages</strong><small>{loading ? 'Loading packages...' : `${packages.length} published package${packages.length === 1 ? '' : 's'}`}</small></span>
            <span className="cater-management-arrow" aria-hidden="true">↓</span>
          </a>
          <a className="cater-management-action" href="#package-themes">
            <span className="cater-management-action-icon" aria-hidden="true">✦</span>
            <span><strong>Packages &amp; themes</strong><small>Browse offerings by event type</small></span>
            <span className="cater-management-arrow" aria-hidden="true">↓</span>
          </a>
        </div>

        <section className="admin-section" id="package-themes">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Occasion categories</p><h3>Package themes</h3></div>
            <span className="admin-section-count">{themeCounts.length} event types</span>
          </div>
          <div className="cater-theme-grid">
            {themeCounts.map((theme) => (
              <a
                className={`cater-theme-card ${selectedTheme === theme.name ? 'active' : ''}`}
                href="#package-review"
                key={theme.name}
                onClick={() => setSelectedTheme(theme.name)}
              >
                <strong>{theme.name}</strong>
                <span>{theme.count} package{theme.count === 1 ? '' : 's'}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="admin-section" id="package-review">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Verified caterers</p><h3>Published packages</h3></div>
            <span className="admin-section-count">
              {loading ? 'Loading...' : `${visiblePackages.length} of ${packages.length} packages`}
              {selectedTheme && <button className="cater-package-clear" onClick={() => setSelectedTheme('')} type="button">Clear filter</button>}
            </span>
          </div>
          {loading ? (
            <p className="admin-empty">Loading published packages...</p>
          ) : visiblePackages.length ? (
            <div className="cater-package-list">
              {visiblePackages.map((item) => (
                <article className="cater-package-row" key={item.id}>
                  <div className="cater-package-details">
                    <span className="service-type">{item.event_type || 'Other'}</span>
                    <strong>{item.package_name}</strong>
                    <small>{item.caterers?.business_name || 'Verified caterer'}</small>
                    {item.description && <small>{item.description}</small>}
                  </div>
                  <div className="cater-package-meta">
                    <strong>{money(item.price)}</strong>
                    <small>{item.guest_count_min}–{item.guest_count_max} guests</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-empty">{selectedTheme ? `No packages found for ${selectedTheme}.` : 'No packages from verified caterers are available yet.'}</p>
          )}
        </section>
      </div>
    </DashboardPage>
  );
}
