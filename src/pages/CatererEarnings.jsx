import { useEffect, useState } from 'react';
import { BanknoteArrowUp, LoaderCircle, RefreshCw } from 'lucide-react';
import { requestJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const historyPageSize = 8;

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CatererEarnings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyPayoutId, setBusyPayoutId] = useState(null);
  const [payoutFeedback, setPayoutFeedback] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  async function load() {
    try {
      const { data: earnings, error: loadError } = await supabase.rpc('get_caterer_earnings');
      if (loadError) throw loadError;
      setData(earnings || { summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
      setError('');
    } catch (reason) {
      setError(reason.message);
      setData({ summary: { total: 0, paid: 0, pending: 0 }, payouts: [] });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const payouts = data?.payouts || [];
  const activePayouts = payouts.filter((payout) => ['pending', 'processing'].includes(payout.payout_status));

  useEffect(() => {
    const processingPayouts = activePayouts.filter((payout) => payout.payout_status === 'processing');
    if (processingPayouts.length === 0) return undefined;

    const timer = setInterval(async () => {
      try {
        await Promise.all(processingPayouts.map((payout) => requestJson('/backend/payout_api.php', {
          method: 'POST',
          body: JSON.stringify({ payout_id: payout.id, action: 'status' }),
        })));
        await load();
      } catch (reason) {
        setPayoutFeedback((current) => ({
          ...current,
          ...Object.fromEntries(processingPayouts.map((payout) => [
            payout.id,
            { type: 'error', message: reason.message },
          ])),
        }));
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [data]);

  async function handlePayout(payout, action) {
    if (busyPayoutId !== null) return;
    setBusyPayoutId(payout.id);
    setPayoutFeedback((current) => ({
      ...current,
      [payout.id]: {
        type: 'info',
        message: action === 'request' ? 'Submitting payout request to PayPal…' : 'Checking payout status…',
      },
    }));
    try {
      const result = await requestJson('/backend/payout_api.php', {
        method: 'POST',
        body: JSON.stringify({ payout_id: payout.id, action }),
      });
      setPayoutFeedback((current) => ({
        ...current,
        [payout.id]: { type: 'success', message: result.message || 'Payout status updated.' },
      }));
      await load();
    } catch (reason) {
      setPayoutFeedback((current) => ({
        ...current,
        [payout.id]: { type: 'error', message: reason.message },
      }));
      if (action === 'request') setShowHistory(true);
      await load();
    } finally {
      setBusyPayoutId(null);
    }
  }

  function canRetryPayout(payout) {
    return payout.payout_status === 'failed'
      && !payout.payout_batch_id
      && /insufficient funds/i.test(payout.payout_error || '');
  }

  function payoutErrorMessage(payout) {
    const message = payoutFeedback[payout.id]?.message || payout.payout_error || 'PayPal reported that this payout failed.';
    return /insufficient funds/i.test(message)
      ? `${message} In Sandbox, add test funds to the platform sender account, then retry.`
      : message;
  }

  const payoutHistory = payouts.filter((payout) => ['paid', 'failed'].includes(payout.payout_status));
  const historyPageCount = Math.max(1, Math.ceil(payoutHistory.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedPayoutHistory = payoutHistory.slice(
    (currentHistoryPage - 1) * historyPageSize,
    currentHistoryPage * historyPageSize,
  );

  return <DashboardPage role="caterer" section="earnings">
    {error && <p className="form-alert error-alert" role="alert">{error}</p>}
    {!data ? <LoadingSpinner /> : <>
      <div className="caterer-earnings-page">
        <header className="caterer-earnings-heading"><h2>Earnings</h2></header>
        <div className="stats-grid caterer-earnings-summary">
          <article className="stat-card"><h3>Total earnings</h3><strong>{money(data.summary?.total)}</strong></article>
          <article className="stat-card"><h3>Paid out</h3><strong>{money(data.summary?.paid)}</strong></article>
          <article className="stat-card"><h3>Pending payout</h3><strong>{money(data.summary?.pending)}</strong></article>
        </div>
        <section className="caterer-earnings-payouts">
          <div className="analytics-status-title">
            <h2>{showHistory ? 'Payout history' : 'Payouts'}</h2>
            <button className="button button-secondary button-small" onClick={() => { setShowHistory((show) => !show); setHistoryPage(1); }} type="button" aria-pressed={showHistory}>
              {showHistory ? 'Back to payouts' : `History (${payoutHistory.length})`}
            </button>
          </div>
          {showHistory ? (
            payoutHistory.length ? (
              <>
                <p className="caterer-history-scroll-hint">Scroll horizontally to see all payout details.</p>
                <div className="caterer-reservation-history-wrap caterer-payout-history-wrap" role="region" aria-label="Payout history" tabIndex="0">
                  <table className="caterer-reservation-history-table caterer-payout-history-table" aria-label="Payout history">
                <thead>
                  <tr>
                    <th scope="col">Package</th>
                    <th scope="col">Reservation</th>
                    <th scope="col">Event date</th>
                    <th scope="col">Gross</th>
                    <th scope="col">Platform fee</th>
                    <th scope="col">Caterer amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Paid date</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPayoutHistory.map((payout) => (
                    <tr key={payout.id}>
                      <td>
                        <strong>{payout.package_name || 'Catering package'}</strong>
                        {payout.payment_method === 'gcash' && <small className="caterer-payout-history-note">Direct GCash payment</small>}
                      </td>
                      <td>#{payout.reservation_id}</td>
                      <td>{formatDate(payout.event_date)}</td>
                      <td>{money(payout.gross_amount)}</td>
                      <td>{money(payout.platform_fee)}</td>
                      <td><strong>{money(payout.caterer_amount)}</strong></td>
                      <td>
                        <span className={`caterer-history-payment caterer-payout-history-status caterer-payout-history-status-${payout.payout_status}`}>{payout.payout_status}</span>
                        {payout.payout_status === 'failed' && (
                          <>
                            <small className="caterer-payout-history-note" role="alert">{payoutErrorMessage(payout)}</small>
                            {canRetryPayout(payout) && (
                              <button
                                className="button button-secondary button-small payout-retry-button"
                                disabled={busyPayoutId !== null}
                                onClick={() => { setShowHistory(false); handlePayout(payout, 'request'); }}
                                type="button"
                              >
                                {busyPayoutId === payout.id
                                  ? <><LoaderCircle className="payout-loading-spinner" size={15} aria-hidden="true" /> Retrying…</>
                                  : 'Retry payout'}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                      <td>{payout.payout_status === 'paid' ? formatDate(payout.paid_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                  </table>
                </div>
                {payoutHistory.length > historyPageSize && (
                  <div className="analytics-status-title caterer-reservation-pagination" aria-label="Payment history pages">
                    <span className="caterer-reservation-pagination-range">
                      Showing {(currentHistoryPage - 1) * historyPageSize + 1}–{Math.min(currentHistoryPage * historyPageSize, payoutHistory.length)} of {payoutHistory.length}
                    </span>
                    <div className="caterer-reservation-pagination-controls">
                      <button className="button button-secondary button-small" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} type="button">Previous</button>
                      <span aria-live="polite">Page {currentHistoryPage} of {historyPageCount}</span>
                      <button className="button button-secondary button-small" disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} type="button">Next</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="caterer-earnings-empty">
                <BanknoteArrowUp size={20} aria-hidden="true" />
                <p>No payment history yet.</p>
              </div>
            )
          ) : activePayouts.length > 0 ? (
            <div className="reservation-list caterer-earnings-payout-list">
              {activePayouts.map((payout) => <article className="package-card caterer-payout-card" key={payout.id}>
                <h3>{payout.package_name}</h3>
                <p>Reservation #{payout.reservation_id} · {payout.event_date}</p>
                <p>Gross {money(payout.gross_amount)} · Platform fee {money(payout.platform_fee)}</p>
                <strong>{money(payout.caterer_amount)}</strong>
                <span className={`admin-status admin-status-${payout.payout_status}`}>{payout.payout_status}</span>
                {payout.payout_status === 'processing' && <p role="status">PayPal is processing this payout. Status refreshes automatically.</p>}
                {payout.payout_status === 'pending' && <button className="button button-primary button-small" disabled={busyPayoutId !== null} onClick={() => handlePayout(payout, 'request')} type="button">{busyPayoutId === payout.id ? <LoaderCircle className="payout-loading-spinner" size={15} aria-hidden="true" /> : <BanknoteArrowUp size={15} aria-hidden="true" />}{busyPayoutId === payout.id ? 'Requesting…' : 'Request payout'}</button>}
                {payout.payout_status === 'processing' && <button className="button button-secondary button-small" disabled={busyPayoutId !== null} onClick={() => handlePayout(payout, 'status')} type="button">{busyPayoutId === payout.id ? <LoaderCircle className="payout-loading-spinner" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}{busyPayoutId === payout.id ? 'Checking…' : 'Check payout status'}</button>}
                {payoutFeedback[payout.id] && (
                  <p className={`payout-inline-feedback payout-inline-feedback-${payoutFeedback[payout.id].type}`} role={payoutFeedback[payout.id].type === 'error' ? 'alert' : 'status'}>
                    {payoutFeedback[payout.id].message}
                  </p>
                )}
              </article>)}
            </div>
          ) : (
            <div className="caterer-earnings-empty">
              <BanknoteArrowUp size={20} aria-hidden="true" />
              <p>No payouts are waiting for a payout request.</p>
            </div>
          )}
        </section>
      </div>
    </>}
  </DashboardPage>;
}