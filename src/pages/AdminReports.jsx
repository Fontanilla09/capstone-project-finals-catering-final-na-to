import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

const statusOptions = [
  ['open', 'Open'],
  ['in_review', 'In review'],
  ['resolved', 'Resolved'],
  ['dismissed', 'Dismissed'],
];

const statusLabels = Object.fromEntries(statusOptions);

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('open');
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [restrictionTarget, setRestrictionTarget] = useState(null);
  const [restrictionReason, setRestrictionReason] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    setLoading(true);
    setStatus('');
    try {
      const { data, error } = await supabase
        .from('customer_reports')
        .select('id, customer_id, reporter_name, reporter_email, target_type, target_name, caterer_id, package_id, reason, details, proof_image_path, status, admin_note, created_at, handled_at, caterers(business_name, city, is_verified, is_suspended, suspension_reason)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const reportRows = data || [];
      const reportIds = reportRows.map((report) => report.id);
      const historyResult = reportIds.length
        ? await supabase
            .from('customer_report_history')
            .select('id, report_id, event_type, previous_status, new_status, details, changed_by, created_at')
            .in('report_id', reportIds)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
        : { data: [], error: null };
      if (historyResult.error) throw historyResult.error;
      const historyByReport = new Map();
      (historyResult.data || []).forEach((entry) => {
        const entries = historyByReport.get(entry.report_id) || [];
        entries.push(entry);
        historyByReport.set(entry.report_id, entries);
      });
      const rows = await Promise.all(reportRows.map(async (report) => {
        if (!report.proof_image_path) {
          return { ...report, history: historyByReport.get(report.id) || [] };
        }
        const { data: signedImage, error: imageError } = await supabase.storage
          .from('customer-report-proofs')
          .createSignedUrl(report.proof_image_path, 3600);
        return {
          ...report,
          history: historyByReport.get(report.id) || [],
          proofImageUrl: signedImage?.signedUrl || '',
          proofImageError: imageError?.message || '',
        };
      }));
      setReports(rows);
      setNotes((current) => {
        const next = { ...current };
        rows.forEach((report) => {
          if (!(report.id in next)) next[report.id] = report.admin_note || '';
        });
        return next;
      });
    } catch (error) {
      setStatus(error.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => reports.reduce((result, report) => {
    result[report.status] = (result[report.status] || 0) + 1;
    return result;
  }, {}), [reports]);

  const visibleReports = filter === 'all'
    ? reports
    : reports.filter((report) => report.status === filter);

  async function updateReport(report, nextStatus) {
    setSavingId(report.id);
    setStatus('');
    try {
      const { data: profile, error: profileError } = await supabase.rpc('get_my_profile');
      if (profileError) throw profileError;
      const adminUserId = profile?.[0]?.user_id;
      if (!adminUserId || profile?.[0]?.role !== 'admin') {
        throw new Error('Admin profile is unavailable.');
      }
      const { error } = await supabase
        .from('customer_reports')
        .update({
          status: nextStatus,
          admin_note: notes[report.id]?.trim() || null,
          handled_by: adminUserId,
          handled_at: new Date().toISOString(),
        })
        .eq('id', report.id);
      if (error) throw error;
      await load();
    } catch (error) {
      setStatus(error.message || 'Unable to update this report.');
    } finally {
      setSavingId(null);
    }
  }

  async function updateCatererRestriction(report, isSuspended) {
    setSavingId(report.id);
    setStatus('');
    try {
      const reason = restrictionReason.trim();
      if (isSuspended && reason.length < 5) {
        throw new Error('Enter a restriction reason of at least 5 characters.');
      }
      const { error } = await supabase.rpc('set_caterer_suspension', {
        p_caterer_id: report.caterer_id,
        p_is_suspended: isSuspended,
        p_reason: isSuspended ? reason : null,
      });
      if (error) throw error;
      setRestrictionTarget(null);
      setRestrictionReason('');
      setStatus(isSuspended ? 'Caterer restricted; their packages are no longer publicly available.' : 'Caterer restriction lifted.');
      await load();
    } catch (error) {
      setStatus(error.message || 'Unable to update the caterer restriction.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <DashboardPage role="admin" section="reports">
      <div className="admin-workspace">
        <div className="admin-intro">
          <div>
            <p className="eyebrow">Customer support</p>
            <h2>Reports &amp; complaints</h2>
            <p>Review concerns about caterers and packages, then record how each report was handled.</p>
          </div>
          <button className="admin-refresh" onClick={load} type="button" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh reports'}
          </button>
        </div>

        {status && <p className="form-alert error-alert" role="alert">{status}</p>}

        <div className="report-summary-grid">
          {statusOptions.map(([key, label]) => (
            <article className={`report-summary-card report-summary-${key}`} key={key}>
              <span>{label}</span>
              <strong>{counts[key] || 0}</strong>
            </article>
          ))}
        </div>

        <div className="report-filter-row" aria-label="Filter reports">
          {['open', 'in_review', 'resolved', 'dismissed', 'all'].map((key) => (
            <button
              className={filter === key ? 'report-filter active' : 'report-filter'}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {key === 'all' ? 'All reports' : statusLabels[key]}
              {key !== 'all' && <span>{counts[key] || 0}</span>}
            </button>
          ))}
        </div>

        <section className="report-list" aria-label="Customer reports">
          {loading ? (
            <p className="admin-empty">Loading reports...</p>
          ) : visibleReports.length ? visibleReports.map((report) => (
            <article className={`report-card${report.status === 'dismissed' ? ' report-card-dismissed' : ''}`} key={report.id}>
              <div className="report-card-heading">
                <div>
                  <span className={`report-status report-status-${report.status}`}>{statusLabels[report.status] || report.status}</span>
                  <p className="eyebrow">{report.target_type === 'package' ? 'Package report' : 'Caterer report'}</p>
                  <h3>{report.target_name}</h3>
                </div>
                <time className="report-reported-at" dateTime={report.created_at}>
                  <span>Reported</span>
                  <strong>{new Date(report.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                </time>
              </div>
              <div className="report-card-meta">
                <span><strong>Reported by</strong> {report.reporter_name}{report.reporter_email ? ` · ${report.reporter_email}` : ''}</span>
                <span><strong>Reason</strong> {report.reason}</span>
                {report.caterer_id && <span><strong>Caterer</strong> {report.caterers?.business_name || report.target_name} · ID #{report.caterer_id}{report.caterers?.city ? ` · ${report.caterers.city}` : ''}</span>}
                {report.package_id && <span><strong>Package ID</strong> #{report.package_id}</span>}
              </div>
              {report.caterer_id && (
                <div className="report-caterer-action">
                  {report.caterers?.is_suspended ? (
                    <div>
                      <span className="report-status report-status-dismissed">Caterer restricted</span>
                      {report.caterers.suspension_reason && <small>Reason: {report.caterers.suspension_reason}</small>}
                      <button className="button button-primary" disabled={savingId === report.id} onClick={() => updateCatererRestriction(report, false)} type="button">
                        {savingId === report.id ? 'Saving...' : 'Lift restriction'}
                      </button>
                    </div>
                  ) : restrictionTarget === report.id ? (
                    <div className="report-restrict-form">
                      <label className="report-note-label" htmlFor={`restriction-reason-${report.id}`}>Reason for restricting this caterer (minimum 5 characters)</label>
                      <textarea id={`restriction-reason-${report.id}`} className="report-note" value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} maxLength={500} placeholder="Explain why this caterer is being restricted." />
                      <div className="report-actions">
                        <button className="button admin-button-muted" onClick={() => { setRestrictionTarget(null); setRestrictionReason(''); }} type="button">Cancel</button>
                        <button className="button admin-button-danger" disabled={savingId === report.id || restrictionReason.trim().length < 5} onClick={() => updateCatererRestriction(report, true)} type="button">
                          {savingId === report.id ? 'Saving...' : 'Confirm restriction'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="button admin-button-danger" disabled={savingId === report.id || !report.caterers} onClick={() => { setRestrictionTarget(report.id); setRestrictionReason(''); setStatus(''); }} type="button">
                      Restrict caterer
                    </button>
                  )}
                </div>
              )}
              <p className="report-details">{report.details}</p>
              {report.proof_image_path && (
                <div className="report-proof">
                  <strong>Customer proof</strong>
                  {report.proofImageUrl ? (
                    <a href={report.proofImageUrl} target="_blank" rel="noreferrer">
                      <img src={report.proofImageUrl} alt={`Proof submitted for ${report.target_name}`} />
                      <span>Open full-size image ↗</span>
                    </a>
                  ) : (
                    <small role="alert">{report.proofImageError || 'Unable to load the proof image.'}</small>
                  )}
                </div>
              )}
              <details className="report-history">
                <summary>History <span>{report.history?.length || 0}</span></summary>
                {report.history?.length ? (
                  <ol>
                    {report.history.map((entry) => (
                      <li className="report-history-entry" key={entry.id}>
                        <div>
                          <strong>
                            {entry.event_type === 'submitted' ? 'Report submitted'
                              : entry.event_type === 'status_changed' ? `${statusLabels[entry.new_status] || entry.new_status} status`
                                : entry.event_type === 'admin_note_updated' ? 'Admin note updated'
                                  : 'History tracking started'}
                          </strong>
                          {entry.event_type === 'status_changed' && entry.previous_status && (
                            <span>{statusLabels[entry.previous_status] || entry.previous_status} → {statusLabels[entry.new_status] || entry.new_status}</span>
                          )}
                          {entry.event_type !== 'status_changed' && entry.details && <span>{entry.details}</span>}
                          <small>{entry.changed_by ? 'Admin' : entry.event_type === 'submitted' ? 'Customer' : 'System'}</small>
                        </div>
                        <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No history yet. Apply the customer-report history migration to start tracking changes.</p>
                )}
              </details>
              <label className="report-note-label" htmlFor={`report-note-${report.id}`}>Admin notes (visible to admins only)</label>
              <textarea
                id={`report-note-${report.id}`}
                className="report-note"
                value={notes[report.id] || ''}
                onChange={(event) => setNotes({ ...notes, [report.id]: event.target.value })}
                maxLength={2000}
                placeholder="Record the action taken or follow-up needed."
              />
              <div className="report-card-footer">
                {report.handled_at && <small>Last updated {new Date(report.handled_at).toLocaleString()}</small>}
                <div className="report-actions">
                  {statusOptions.map(([nextStatus, label]) => (
                    <button
                      className={`button ${nextStatus === 'resolved' ? 'button-primary' : 'admin-button-muted'}`}
                      disabled={savingId === report.id || report.status === nextStatus}
                      key={nextStatus}
                      onClick={() => updateReport(report, nextStatus)}
                      type="button"
                    >
                      {savingId === report.id ? 'Saving...' : nextStatus === report.status ? label : `Mark ${label.toLowerCase()}`}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          )) : (
            <p className="admin-empty">{filter === 'all' ? 'No customer reports have been submitted.' : `No ${statusLabels[filter]?.toLowerCase() || ''} reports.`}</p>
          )}
        </section>
      </div>
    </DashboardPage>
  );
}
