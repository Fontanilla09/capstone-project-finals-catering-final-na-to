import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Flag,
  MessageCircle,
  Printer,
  ReceiptText,
  Star,
  X,
} from 'lucide-react';
import { requestJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import GcashPaymentForm from '../components/GcashPaymentForm.jsx';

function statusClass(status) {
  return `status-pill status-${status}`;
}

function canReview(item) {
  return item.reservation_status === 'completed' && Number(item.paid_amount) >= Number(item.total_amount);
}

function formatMoney(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function formatEventDate(value) {
  if (!value) return 'Date to be confirmed';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntilEvent(value) {
  if (!value) return null;
  const event = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(event.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((event.getTime() - today.getTime()) / 86400000);
}

function timeAgo(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

export default function CustomerDashboard() {
  const notificationRoute = new URLSearchParams(window.location.search).get('notifications') === '1';
  const [customer, setCustomer] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationsError, setConversationsError] = useState('');
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [statusAlerts, setStatusAlerts] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(notificationRoute);
  const [showBookingHistory, setShowBookingHistory] = useState(false);
  const [status, setStatus] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [payingBalanceId, setPayingBalanceId] = useState(null);
  const [gcashOptions, setGcashOptions] = useState([]);
  const [gcashOption, setGcashOption] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewImage, setReviewImage] = useState(null);
  const [reviewImagePreview, setReviewImagePreview] = useState('');
  const [reportingReservation, setReportingReservation] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const statusSnapshotRef = useRef(null);

  async function load() {
    try {
      const { data, error } = await supabase.rpc('get_customer_dashboard');
      if (error) throw error;

      const dashboardReservations = data?.reservations || [];
      setCustomer(data?.customer || null);
      setReservations(dashboardReservations);
      const { data: gcashData, error: gcashError } = await supabase.rpc('get_my_gcash_payment_options');
      if (gcashError) throw gcashError;
      setGcashOptions(gcashData || []);
      const { data: conversationData, error: conversationError } = await supabase.rpc('get_my_conversations');
      if (conversationError) {
        console.error('Failed to load customer dashboard conversations:', conversationError);
        setConversationsError('Messages are temporarily unavailable.');
      } else {
        setConversations(conversationData || []);
        setConversationsError('');
      }

      setConversationsLoaded(true);

      const customerId = data?.customer?.id;
      if (customerId) {
        const storageKey = `caterai-reservation-statuses-${customerId}`;
        const alertsKey = `caterai-reservation-notifications-${customerId}`;
        const unreadKey = `caterai-reservation-notifications-unread-${customerId}`;
        let previousSnapshot = statusSnapshotRef.current?.customerId === customerId
          ? statusSnapshotRef.current.reservations
          : null;
        if (!previousSnapshot) {
          try { previousSnapshot = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { previousSnapshot = null; }
        }
        let savedAlerts = [];
        try { savedAlerts = JSON.parse(localStorage.getItem(alertsKey) || '[]'); } catch { savedAlerts = []; }

        const currentSnapshot = Object.fromEntries(dashboardReservations.map((item) => [String(item.id), {
          reservation_status: item.reservation_status,
          paid_amount: Number(item.paid_amount || 0),
          package_name: item.package_name,
          total_amount: Number(item.total_amount || 0),
        }]));
        if (previousSnapshot) {
          const changes = [];
          for (const item of dashboardReservations) {
            const previous = previousSnapshot[String(item.id)];
            if (!previous) {
              changes.push({
                id: `booking-new-${item.id}`,
                type: 'booking',
                title: 'New booking request',
                message: `${item.package_name} booking is now ${item.reservation_status}.`,
              });
              continue;
            }
            if (previous.reservation_status !== item.reservation_status) {
              changes.push({
                id: `booking-${item.id}-${item.reservation_status}`,
                type: 'booking',
                title: 'Booking status changed',
                message: `${item.package_name} is now ${item.reservation_status}.${item.rejection_reason ? ` Reason: ${item.rejection_reason}` : ''}`,
              });
            } else if (Number(item.paid_amount || 0) > Number(previous.paid_amount || 0)) {
              changes.push({
                id: `payment-${item.id}-${item.paid_amount}`,
                type: 'payment',
                title: 'Payment received',
                message: `${item.package_name}: ₱${Number(item.paid_amount).toLocaleString('en-PH')} paid of ₱${Number(item.total_amount).toLocaleString('en-PH')}.`,
              });
            }
          }
          const freshChanges = changes.filter((notice) => !savedAlerts.some((saved) => saved.id === notice.id));
          const mergedAlerts = [...freshChanges, ...savedAlerts].filter((notice, index, all) => all.findIndex((entry) => entry.id === notice.id) === index).slice(0, 20);
          savedAlerts = mergedAlerts;
          if (freshChanges.length) {
            const previousUnread = Number(localStorage.getItem(unreadKey) || 0);
            localStorage.setItem(unreadKey, String(previousUnread + freshChanges.length));
          }
        }
        setStatusAlerts(savedAlerts);
        try { localStorage.setItem(alertsKey, JSON.stringify(savedAlerts)); } catch { /* Storage may be unavailable. */ }
        statusSnapshotRef.current = { customerId, reservations: currentSnapshot };
        try { localStorage.setItem(storageKey, JSON.stringify(currentSnapshot)); } catch { /* Storage may be unavailable. */ }

        if (notificationRoute) {
          setNotificationsOpen(true);
          localStorage.setItem(unreadKey, '0');
        }
      }

      const query = new URLSearchParams(window.location.search);
      if (query.get('payment') === 'success') {
        const latestPayment = dashboardReservations
          .flatMap((reservation) => (reservation.payments || []).map((payment) => ({ reservation, payment })))
          .sort((first, second) => new Date(second.payment.created_at || second.payment.payment_date || 0) - new Date(first.payment.created_at || first.payment.payment_date || 0))[0];
        if (latestPayment) setReceipt(latestPayment);
      }
      setStatus('');
      if (query.get('gcash') === 'submitted') {
        setStatus('GCash receipt submitted. The caterer must confirm it before your payment is marked received.');
      }
      if (query.has('payment') || query.has('notifications') || query.has('gcash')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function submitBookingReport(event) {
    event.preventDefault();
    setReportError('');
    if (!reportingReservation) return;
    if (!reportReason) {
      setReportError('Select an issue type.');
      return;
    }
    if (reportDetails.trim().length < 10) {
      setReportError('Please describe the issue in at least 10 characters.');
      return;
    }

    setReportSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_customer_booking_issue', {
        p_reservation_id: Number(reportingReservation.id),
        p_reason: reportReason,
        p_details: reportDetails.trim(),
      });
      if (error) throw error;
      setReportingReservation(null);
      setReportReason('');
      setReportDetails('');
      setStatus(`Your report about booking #${reportingReservation.id} with ${reportingReservation.business_name} was sent to the admin team.`);
    } catch (error) {
      setReportError(error.message || 'Unable to submit your booking report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const refreshWhileVisible = () => {
      if (!document.hidden) load();
    };
    const timer = setInterval(refreshWhileVisible, 60000);
    window.addEventListener('focus', refreshWhileVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshWhileVisible);
    };
  }, []);

  useEffect(() => {
    if (!reviewImage) {
      setReviewImagePreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(reviewImage);
    setReviewImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [reviewImage]);

  useEffect(() => {
    if (reviewingId) {
      document.getElementById('review-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [reviewingId]);

  useEffect(() => {
    if (!receipt) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setReceipt(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [receipt]);

  async function payBalance(id) {
    if (payingBalanceId !== null) return;
    setPayingBalanceId(id);
    try {
      setStatus('');
      const result = await requestJson('/backend/balance_api.php', {
        method: 'POST',
        body: JSON.stringify({ reservation_id: id }),
      });
      if (!result.approval_url) throw new Error('PayPal did not return a checkout link.');
      window.location.assign(result.approval_url);
    } catch (error) {
      setStatus(error.message);
      setPayingBalanceId(null);
    }
  }

  function findGcashOption(reservationId, paymentType) {
    return gcashOptions.find((option) => String(option.reservation_id) === String(reservationId)
      && option.payment_type === paymentType);
  }

  function balancePaymentLabel(reservationId) {
    const option = findGcashOption(reservationId, 'balance');
    if (option?.latest_submission_status === 'pending') return 'GCash receipt awaiting confirmation';
    return 'Pay balance with PayPal';
  }

  function balanceGcashPending(reservationId) {
    return findGcashOption(reservationId, 'balance')?.latest_submission_status === 'pending';
  }

  async function openGcashPayment(option) {
    if (!option) return;
    if (option.latest_submission_status === 'pending') {
      setStatus('Your GCash receipt is waiting for the caterer to review it.');
      return;
    }
    setGcashOption(option);
  }

  async function removeRejectedReservation(id) {
    if (!window.confirm('Remove this cancelled booking from your list? The booking record will be kept.')) return;
    try {
      const { error } = await supabase.rpc('dismiss_cancelled_reservation', { p_reservation_id: id });
      if (error) throw error;
      setReservations((current) => current.filter((item) => String(item.id) !== String(id)));
      setStatus('Rejected booking removed from your list.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function dismissStatusAlert(id) {
    const customerId = customer?.id;
    setStatusAlerts((current) => {
      const next = current.filter((item) => item.id !== id);
      if (customerId) {
        try { localStorage.setItem(`caterai-reservation-notifications-${customerId}`, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
      }
      return next;
    });
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!reviewingId) return;
    let uploadedImagePath = null;
    let uploadedImageUrl = null;
    try {
      if (reviewImage) {
        if (reviewImage.size > 5 * 1024 * 1024) {
          throw new Error('The event photo must be 5 MB or smaller.');
        }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(reviewImage.type)) {
          throw new Error('Upload a JPG, PNG, or WEBP event photo.');
        }
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('Sign in to upload a review photo.');
        const extension = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        }[reviewImage.type];
        uploadedImagePath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('review-images')
          .upload(uploadedImagePath, reviewImage, { contentType: reviewImage.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('review-images').getPublicUrl(uploadedImagePath);
        if (!publicUrlData?.publicUrl) throw new Error('Unable to generate the review photo URL.');
        uploadedImageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.rpc('submit_catering_review', {
        p_reservation_id: reviewingId,
        p_rating: rating,
        p_review_text: reviewText.trim(),
        p_review_image: uploadedImageUrl,
      });
      if (error) {
        if (uploadedImagePath) {
          await supabase.storage.from('review-images').remove([uploadedImagePath]);
        }
        throw error;
      }
      setReviewingId(null);
      setReviewText('');
      setRating(5);
      setReviewImage(null);
      setReviewImagePreview('');
      await load();
      setStatus('Review submitted. Thank you for sharing your experience.');
    } catch (error) {
      if (uploadedImagePath) {
        try { await supabase.storage.from('review-images').remove([uploadedImagePath]); } catch { /* cleanup failed */ }
      }
      setStatus(error.message);
    }
  }

  const summary = useMemo(() => ({
    total: reservations.length,
    pending: reservations.filter((item) => item.reservation_status === 'pending').length,
  }), [reservations]);
  const upcomingReservations = useMemo(() => reservations
    .filter((item) => !['cancelled', 'completed'].includes(item.reservation_status))
    .filter((item) => {
      const days = daysUntilEvent(item.event_date);
      return days !== null && days >= 0;
    })
    .sort((first, second) => String(first.event_date || '9999-12-31').localeCompare(String(second.event_date || '9999-12-31'))), [reservations]);
  const nextEvent = upcomingReservations[0] || null;
  const totalPaid = reservations.reduce((sum, item) => sum + Math.max(0, Number(item.paid_amount || 0)), 0);
  const totalBalance = reservations.reduce((sum, item) => {
    if (!['confirmed', 'completed'].includes(item.reservation_status)) return sum;
    return sum + Math.max(0, Number(item.total_amount || 0) - Number(item.paid_amount || 0));
  }, 0);
  const actionItems = useMemo(() => {
    const balanceActions = reservations
      .filter((item) => ['confirmed', 'completed'].includes(item.reservation_status))
      .filter((item) => Number(item.total_amount || 0) > Number(item.paid_amount || 0))
      .map((item) => ({
        id: `balance-${item.id}`,
        type: 'balance',
        reservation: item,
        detail: `Pay before the event · ${formatEventDate(item.event_date)}`,
      }));
    const reviewActions = reservations.filter(canReview).filter((item) => !item.review_rating).map((item) => ({
      id: `review-${item.id}`,
      type: 'review',
      reservation: item,
      title: `Rate your ${item.package_name} event`,
      detail: 'Help others choose the right caterer',
    }));
    const approvalActions = reservations.filter((item) => item.reservation_status === 'pending').map((item) => ({
      id: `approval-${item.id}`,
      type: 'approval',
      reservation: item,
      title: `Waiting for ${item.business_name || 'your caterer'} to confirm`,
      detail: `Requested for ${formatEventDate(item.event_date)}`,
    }));
    return [...balanceActions, ...reviewActions, ...approvalActions];
  }, [reservations]);
  const visibleReservations = useMemo(
    () => reservations.filter((item) => (item.reservation_status === 'completed') === showBookingHistory),
    [reservations, showBookingHistory],
  );

  const reminders = useMemo(() => reservations.flatMap((item) => {
    const notices = [];
    const paidAmount = Number(item.paid_amount || 0);
    const totalAmount = Number(item.total_amount || 0);
    const remaining = Math.max(0, totalAmount - paidAmount);
    if (['confirmed', 'completed'].includes(item.reservation_status) && remaining > 0) {
      notices.push({
        id: `balance-${item.id}`,
        reservationId: item.id,
        type: 'balance',
        title: 'Remaining balance',
        message: `${item.package_name}: ₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remains to be paid.`,
      });
    }

    if (!['cancelled', 'completed'].includes(item.reservation_status) && item.event_date) {
      const eventDate = new Date(`${item.event_date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
      if (!Number.isNaN(daysUntil) && daysUntil >= 0 && daysUntil <= 7) {
        notices.push({
          id: `event-${item.id}`,
          type: 'event',
          title: daysUntil === 0 ? 'Event is today' : `Event in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          message: `${item.package_name} is scheduled for ${item.event_date}${item.event_time ? ` at ${item.event_time}` : ''}.`,
        });
      }
    }
    return notices;
  }), [reservations]);
  const dashboardNotices = [...statusAlerts, ...reminders];
  const nextEventDays = nextEvent ? daysUntilEvent(nextEvent.event_date) : null;
  const nextEventPaid = nextEvent ? Number(nextEvent.paid_amount || 0) : 0;
  const nextEventTotal = nextEvent ? Number(nextEvent.total_amount || 0) : 0;
  const nextEventProgress = nextEventTotal > 0 ? Math.min(100, Math.round((nextEventPaid / nextEventTotal) * 100)) : 0;
  const nextEventStep = nextEvent?.reservation_status === 'completed'
    ? 5
    : nextEventDays === 0
      ? 4
      : nextEventTotal > 0 && nextEventPaid >= nextEventTotal
        ? 3
        : nextEventPaid > 0
          ? 2
          : nextEvent?.reservation_status === 'confirmed'
            ? 1
            : 0;
  const messageCatererHref = nextEvent?.caterer_id && nextEvent?.package_id && customer?.id
    ? `/dashboard/messages?${new URLSearchParams({
      customer_id: String(customer.id),
      caterer_id: String(nextEvent.caterer_id),
      package_id: String(nextEvent.package_id),
    }).toString()}`
    : null;

  return (
    <DashboardPage
      role="customer"
      section={notificationRoute ? 'notifications' : 'overview'}
      balanceReminders={reminders.filter((notice) => notice.type === 'balance')}
    >
      <div className="customer-dashboard-panel">
        {status && <p className="form-alert success-alert">{status}</p>}

        <section className="customer-dashboard-stats" aria-label="Booking and payment summary">
          <article className="customer-dashboard-stat" style={{ '--customer-card-index': 0 }}>
            <span>Total bookings</span>
            <strong>{summary.total}</strong>
          </article>
          <article className="customer-dashboard-stat" style={{ '--customer-card-index': 1 }}>
            <span>Upcoming</span>
            <strong>{upcomingReservations.length}</strong>
          </article>
          <article className="customer-dashboard-stat" style={{ '--customer-card-index': 2 }}>
            <span>Pending approval</span>
            <strong>{summary.pending}</strong>
          </article>
          <article className="customer-dashboard-stat" style={{ '--customer-card-index': 3 }}>
            <span>Total paid</span>
            <strong>{formatMoney(totalPaid)}</strong>
          </article>
          <article className="customer-dashboard-stat customer-dashboard-stat-balance" style={{ '--customer-card-index': 4 }}>
            <span>Balance to pay</span>
            <strong>{formatMoney(totalBalance)}</strong>
          </article>
        </section>

        <section className="customer-dashboard-overview-grid" aria-label="Customer booking overview">
          <article className="customer-next-event customer-dashboard-animated-card" style={{ '--customer-card-index': 0 }}>
            {nextEvent ? (
              <>
                <div className="customer-next-event-heading">
                  <div>
                    <p className="customer-dashboard-kicker">Next event</p>
                    <h2>
                      {nextEventDays === null
                        ? 'Coming up'
                        : nextEventDays === 0
                          ? 'Today'
                          : nextEventDays < 0
                            ? 'Event day'
                            : `In ${nextEventDays} day${nextEventDays === 1 ? '' : 's'}`}
                    </h2>
                    <strong>{nextEvent.package_name || 'Catering event'}</strong>
                    <p className="customer-next-event-meta">
                      {nextEvent.business_name || 'Your caterer'} · {formatEventDate(nextEvent.event_date)}
                    </p>
                  </div>
                  <span className="customer-next-event-icon" aria-hidden="true"><CalendarDays size={26} /></span>
                </div>
                <ol
                  className="customer-booking-timeline"
                  aria-label={`Booking progress: ${nextEvent.reservation_status}`}
                  style={{ '--customer-timeline-progress': `${(nextEventStep / 5) * 92}%` }}
                >
                  {['Requested', 'Confirmed', 'Deposit paid', 'Fully paid', 'Event day', 'Completed'].map((step, index) => (
                    <li className={index <= nextEventStep ? 'is-complete' : ''} key={step}>
                      <span aria-hidden="true" />
                      <small>{step}</small>
                    </li>
                  ))}
                </ol>
                <div className="customer-next-event-payment">
                  <div className="customer-next-event-payment-copy">
                    <strong>{formatMoney(nextEventPaid)} <span>of {formatMoney(nextEventTotal)} paid</span></strong>
                    <strong>{nextEventProgress}%</strong>
                  </div>
                  <div className="customer-next-event-progress" role="progressbar" aria-label="Event payment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={nextEventProgress}>
                    <span style={{ width: `${nextEventProgress}%` }} />
                  </div>
                </div>
                <div className="customer-next-event-actions">
                  {['confirmed', 'completed'].includes(nextEvent.reservation_status) && nextEventPaid < nextEventTotal && (
                    <button className="button button-primary button-small" disabled={payingBalanceId !== null || balanceGcashPending(nextEvent.id)} onClick={() => payBalance(nextEvent.id)} type="button">
                      <CreditCard size={15} aria-hidden="true" /> {payingBalanceId === nextEvent.id ? 'Opening PayPal...' : `${balancePaymentLabel(nextEvent.id)} · ${formatMoney(nextEventTotal - nextEventPaid)}`}
                    </button>
                  )}
                  {messageCatererHref ? (
                    <a className="button button-secondary button-small" href={messageCatererHref}><MessageCircle size={15} aria-hidden="true" /> Message caterer</a>
                  ) : (
                    <button className="button button-secondary button-small" disabled title="Update the customer dashboard database function to enable direct messaging." type="button">
                      <MessageCircle size={15} aria-hidden="true" /> Message unavailable
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="customer-next-event-empty">
                <span className="customer-dashboard-kicker">Your next event</span>
                <h2>Ready to celebrate?</h2>
                <p>Explore caterers and book a package for your next special occasion.</p>
                <a className="button button-primary button-small" href="/packages">Explore caterers <ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            )}
          </article>

          <article className="customer-action-card customer-dashboard-animated-card" style={{ '--customer-card-index': 1 }}>
            <header className="customer-dashboard-card-heading">
              <div>
                <p className="customer-dashboard-kicker">Action needed</p>
                <h2>{actionItems.length} {actionItems.length === 1 ? 'thing' : 'things'} to do</h2>
              </div>
            </header>
            {actionItems.length ? (
              <ul className="customer-action-list">
                {actionItems.slice(0, 6).map((action) => {
                  const ActionIcon = action.type === 'balance' ? CreditCard : action.type === 'review' ? Star : Clock3;
                  return (
                    <li key={action.id}>
                      <ActionIcon className={`customer-action-icon customer-action-icon-${action.type}`} size={19} aria-hidden="true" />
                      <div className="customer-action-copy">
                        <strong>{action.type === 'balance' ? <>Pay {formatMoney(Number(action.reservation.total_amount) - Number(action.reservation.paid_amount))} balance for <b>{action.reservation.package_name}</b></> : action.title}</strong>
                        <span>{action.detail}</span>
                      </div>
                      {action.type === 'balance' ? (
                        <button className="button button-primary button-small" disabled={payingBalanceId !== null || balanceGcashPending(action.reservation.id)} onClick={() => payBalance(action.reservation.id)} type="button">
                          {payingBalanceId === action.reservation.id ? 'Opening PayPal...' : balancePaymentLabel(action.reservation.id)}
                        </button>
                      ) : action.type === 'review' ? (
                        <button className="button button-secondary button-small" onClick={() => setReviewingId(action.reservation.id)} type="button">Rate</button>
                      ) : (
                        <a className="button button-secondary button-small" href="/dashboard/messages">Follow up</a>
                      )}
                    </li>
                  );
                })}
                {actionItems.length > 6 && (
                  <li className="customer-action-more"><a href="#customer-reservations">View all {actionItems.length} actions <ArrowRight size={13} aria-hidden="true" /></a></li>
                )}
              </ul>
            ) : (
              <div className="customer-actions-empty"><CheckCircle2 size={20} aria-hidden="true" /><p>You're all caught up. No actions needed right now.</p></div>
            )}
          </article>
        </section>

        <section className="customer-messages-card customer-dashboard-animated-card" style={{ '--customer-card-index': 2 }}>
          <header className="customer-dashboard-card-heading">
            <div>
              <p className="customer-dashboard-kicker">Messages</p>
              <h2>{conversations.reduce((sum, conversation) => sum + Number(conversation.unread_count || 0), 0)} unread</h2>
            </div>
            <a className="button button-secondary button-small" href="/dashboard/messages">Open all</a>
          </header>
          {conversationsError ? (
            <p className="customer-messages-feedback" role="status">{conversationsError}</p>
          ) : conversations.length ? (
            <ul className="customer-message-list">
              {[...conversations]
                .sort((first, second) => new Date(second.last_message || 0) - new Date(first.last_message || 0))
                .slice(0, 3)
                .map((conversation) => {
                  const unreadCount = Number(conversation.unread_count || 0);
                  const name = conversation.business_name || conversation.other_name || conversation.other_email || 'Caterer';
                  const href = `/dashboard/messages?customer_id=${conversation.customer_id}&caterer_id=${conversation.caterer_id}&package_id=${conversation.package_id || 0}`;
                  return (
                    <li key={`${conversation.customer_id}-${conversation.caterer_id}-${conversation.package_id || 0}`}>
                      <a className="customer-message-avatar" href={href} aria-label={`Open conversation with ${name}`}>{name.charAt(0).toUpperCase()}</a>
                      <a className="customer-message-copy" href={href}>
                        <strong>{name}</strong>
                        <span>{conversation.last_message_text || 'Open conversation'}</span>
                      </a>
                      <span className="customer-message-time">{timeAgo(conversation.last_message)}</span>
                      {unreadCount > 0 && <span className="customer-message-unread" aria-label={`${unreadCount} unread messages`} />}
                    </li>
                  );
                })}
            </ul>
          ) : !conversationsLoaded ? (
            <LoadingSpinner compact />
          ) : (
            <div className="customer-messages-empty"><MessageCircle size={20} aria-hidden="true" /><p>No conversations yet. Message a caterer to get started.</p><a href="/dashboard/messages">Go to messages</a></div>
          )}
        </section>

        {notificationsOpen && (
          <section id="customer-notifications-panel" className="customer-notifications" aria-labelledby="customer-notifications-title">
            <header><Bell size={18} aria-hidden="true" /><h3 id="customer-notifications-title">Notifications &amp; reminders</h3></header>
            <ul aria-live="polite">
              {dashboardNotices.length ? dashboardNotices.map((notice) => (
                <li key={notice.id}>
                  {notice.type === 'event' ? <CalendarClock size={18} aria-hidden="true" /> : notice.type === 'balance' || notice.type === 'payment' ? <CircleDollarSign size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
                  <div><strong>{notice.title}</strong><p>{notice.message}</p></div>
                  {notice.type === 'balance' && <button className="button button-primary button-small" disabled={payingBalanceId !== null || balanceGcashPending(notice.reservationId)} onClick={() => payBalance(notice.reservationId)} type="button">{payingBalanceId === notice.reservationId ? 'Opening PayPal...' : balancePaymentLabel(notice.reservationId)}</button>}
                  {['booking', 'payment'].includes(notice.type) && <button className="notification-dismiss" onClick={() => dismissStatusAlert(notice.id)} type="button" aria-label="Dismiss notification"><X size={16} /></button>}
                </li>
              )) : <li className="customer-notifications-empty">You're all caught up. New booking and payment updates will appear here.</li>}
            </ul>
          </section>
        )}

        <div className="table-card" id="customer-reservations">
          <div className="section-header">
            <div>
              <p className="eyebrow eyebrow-soft">{showBookingHistory ? 'Past bookings' : 'Booking requests'}</p>
              <h3>{showBookingHistory ? 'Booking history' : 'Your reservations'}</h3>
            </div>
            <button className="button button-secondary button-small" onClick={() => setShowBookingHistory((show) => !show)} type="button" aria-pressed={showBookingHistory}>
              {showBookingHistory ? 'Back to reservations' : `History (${reservations.filter((item) => item.reservation_status === 'completed').length})`}
            </button>
          </div>

          <div className="table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Caterer</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservations.length ? visibleReservations.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Package"><strong>{item.package_name}</strong></td>
                    <td data-label="Caterer">{item.business_name}</td>
                    <td data-label="Date">{item.event_date}</td>
                    <td data-label="Payment">
                      <div>₱{Number(item.paid_amount).toLocaleString()} / ₱{Number(item.total_amount).toLocaleString()}</div>
                      {(item.payments || []).map((payment, index) => (
                        <button className="button button-secondary button-small payment-receipt-link" key={payment.transaction_id || payment.order_id || index} onClick={() => setReceipt({ reservation: item, payment })} type="button">
                          <ReceiptText size={14} aria-hidden="true" /> {payment.payment_type === 'balance' ? 'Balance receipt' : 'Payment receipt'}
                        </button>
                      ))}
                    </td>
                    <td data-label="Status">
                      <span className={statusClass(item.reservation_status)}>{item.reservation_status}</span>
                      {item.rejection_reason && <p className="reservation-rejection-reason"><strong>Reason from caterer:</strong> {item.rejection_reason}</p>}
                      {['down_payment', 'balance'].map((paymentType) => {
                        const option = findGcashOption(item.id, paymentType);
                        if (!option) return null;
                        if (option.latest_submission_status === 'pending') {
                          return <p className="gcash-customer-pending" key={paymentType}>GCash receipt submitted · awaiting caterer confirmation</p>;
                        }

                        return (
                          <button
                            className="button button-secondary button-small gcash-customer-action"
                            key={paymentType}
                            onClick={() => openGcashPayment(option)}
                            type="button"
                          >
                            {option.latest_submission_status === 'failed' ? 'Resubmit GCash receipt' : `Pay ${paymentType === 'balance' ? 'balance' : 'down payment'} with GCash`}
                          </button>
                        );
                      })}
                      {gcashOptions.filter((option) => String(option.reservation_id) === String(item.id) && option.latest_submission_status === 'failed').map((option) => (
                        <p className="gcash-customer-rejection" key={`note-${option.payment_type}`}>
                          Receipt not approved: {option.latest_submission_note || 'Please upload a clear receipt showing your payment.'}
                        </p>
                      ))}
                    </td>
                    <td data-label="Action">
                      <div className="customer-reservation-actions">
                        <div className="customer-reservation-primary-action">
                          {item.reservation_status === 'cancelled' ? (
                            <button className="button reservation-dismiss-button" onClick={() => removeRejectedReservation(item.id)} type="button" title="Remove cancelled booking" aria-label="Remove cancelled booking"><X size={16} aria-hidden="true" /></button>
                          ) : (
                            <>
                              {['confirmed', 'completed'].includes(item.reservation_status) && Number(item.paid_amount) < Number(item.total_amount) && (
                                <button className="button button-primary button-small" disabled={payingBalanceId !== null || balanceGcashPending(item.id)} onClick={() => payBalance(item.id)} type="button">{payingBalanceId === item.id ? 'Opening PayPal...' : balancePaymentLabel(item.id)}</button>
                              )}
                              {item.review_rating ? (
                                <span className="reviewed-label">★ {item.review_rating} rated</span>
                              ) : canReview(item) ? (
                                <button className="button button-primary button-small" onClick={() => setReviewingId(item.id)} type="button">Rate catering</button>
                              ) : item.reservation_status === 'confirmed' && Number(item.paid_amount) >= Number(item.total_amount) ? (
                                <span className="muted-label">Event upcoming</span>
                              ) : !['confirmed', 'completed'].includes(item.reservation_status) ? (
                                <span className="muted-label">Awaiting</span>
                              ) : null}
                            </>
                          )}
                        </div>
                        <button
                          aria-label={`Report booking with ${item.business_name}`}
                          className="reservation-report-button"
                          onClick={() => { setReportingReservation(item); setReportReason(''); setReportDetails(''); setReportError(''); }}
                          title="Report this booking"
                          type="button"
                        >
                          <Flag size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <div className="customer-empty-state">
                        <p>{showBookingHistory ? 'No completed bookings yet.' : 'No active booking requests.'}</p>
                        {!showBookingHistory && <a className="button button-primary" href="/packages">Explore caterers <ArrowRight size={16} aria-hidden="true" /></a>}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {reportingReservation && (
          <div className="account-reject-overlay" role="presentation" onClick={() => setReportingReservation(null)}>
            <form
              className="account-reject-form customer-booking-report-form"
              onSubmit={submitBookingReport}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="customer-booking-report-title"
            >
              <header>
                <div>
                  <p className="eyebrow eyebrow-soft">Customer support</p>
                  <h3 id="customer-booking-report-title">Report a booking issue</h3>
                  <p>This report will be sent privately to the admin team.</p>
                </div>
              </header>
              <div className="customer-booking-report-summary">
                <span><strong>Package</strong> {reportingReservation.package_name}</span>
                <span><strong>Caterer</strong> {reportingReservation.business_name}</span>
                <span><strong>Booking</strong> #{reportingReservation.id}</span>
              </div>
              <label htmlFor="customer-booking-report-reason">Issue type</label>
              <select id="customer-booking-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} required>
                <option value="">Select an issue</option>
                <option value="Payment problem">Payment problem</option>
                <option value="Booking status problem">Booking status problem</option>
                <option value="Cancellation or refund">Cancellation or refund</option>
                <option value="Caterer did not arrive">Caterer did not arrive</option>
                <option value="Other booking issue">Other booking issue</option>
              </select>
              <label htmlFor="customer-booking-report-details">Describe the issue</label>
              <textarea
                id="customer-booking-report-details"
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                minLength={10}
                maxLength={2000}
                placeholder="Tell us what happened and how we can help."
                required
              />
              {reportError && <p className="form-alert error-alert" role="alert">{reportError}</p>}
              <div className="account-reject-footer">
                <button className="button button-secondary" onClick={() => setReportingReservation(null)} type="button">Cancel</button>
                <button className="button button-primary" disabled={reportSubmitting} type="submit">
                  {reportSubmitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
            </form>
          </div>
        )}

        {reviewingId && (
          <form id="review-form" className="review-form" onSubmit={submitReview}>
            <h3>Rate your catering experience</h3>
            <p>Share your final impression of the service.</p>

            <label>
              Rating
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </label>

            <label>
              Review
              <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={1000} placeholder="Tell us about your event experience..." />
            </label>

            <label>
              Event photo (optional)
              <input accept="image/jpeg,image/png,image/webp" onChange={(event) => setReviewImage(event.target.files?.[0] || null)} type="file" />
            </label>
            {reviewImagePreview && (
              <div className="review-photo-preview">
                <img src={reviewImagePreview} alt="Selected event preview" />
                <button className="button button-secondary button-small" onClick={() => { setReviewImage(null); setReviewImagePreview(''); }} type="button">Remove photo</button>
              </div>
            )}

            <div className="review-actions">
              <button className="button button-primary" type="submit">Submit review</button>
              <button className="button button-secondary" onClick={() => { setReviewingId(null); setReviewImage(null); setReviewImagePreview(''); }} type="button">Cancel</button>
            </div>
          </form>
        )}

        {receipt && (
          <div className="payment-receipt-overlay" role="dialog" aria-modal="true" aria-label="PayPal payment receipt" onClick={() => setReceipt(null)}>
            <article className="payment-receipt" onClick={(event) => event.stopPropagation()}>
              <header className="payment-receipt-header">
                <div>
                  <p className="eyebrow eyebrow-soft">CaterAI · Payment receipt</p>
                  <h2>Payment confirmed</h2>
                </div>
                <button className="payment-receipt-close" onClick={() => setReceipt(null)} type="button" aria-label="Close receipt"><X size={18} /></button>
              </header>
              <p className="payment-receipt-note">
                {receipt.payment.payment_method === 'gcash'
                  ? 'Paid directly to the caterer through GCash and confirmed by the caterer.'
                  : 'Paid securely through PayPal.'}
              </p>
              <dl className="payment-receipt-details">
                <dt>Package</dt><dd>{receipt.reservation.package_name}</dd>
                <dt>Payment type</dt><dd>{receipt.payment.payment_type === 'balance' ? 'Balance payment' : 'Down payment'}</dd>
                <dt>Amount paid</dt><dd>₱{Number(receipt.payment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                <dt>Payment date</dt><dd>{receipt.payment.payment_date || 'Not available'}</dd>
                {receipt.payment.payment_method === 'gcash' ? (
                  <><dt>Payment method</dt><dd>GCash · confirmed by caterer</dd></>
                ) : (
                  <>
                    <dt>Paid to PayPal account</dt><dd>{receipt.payment.payee_email || 'Recipient not stored for this payment'}</dd>
                    <dt>PayPal transaction ID</dt><dd className="payment-receipt-id">{receipt.payment.transaction_id || 'Not available'}</dd>
                    <dt>PayPal order ID</dt><dd className="payment-receipt-id">{receipt.payment.order_id || 'Not available'}</dd>
                  </>
                )}
                <dt>Payer</dt><dd>{receipt.payment.payer_name || receipt.payment.payer_email || 'Not available'}</dd>
              </dl>
              <div className="payment-receipt-actions">
                <button className="button button-primary" onClick={() => window.print()} type="button"><Printer size={16} aria-hidden="true" /> Print receipt</button>
              </div>
            </article>
          </div>
        )}
        {gcashOption && (
          <GcashPaymentForm
            option={gcashOption}
            onClose={() => setGcashOption(null)}
            onSubmitted={async () => {
              setGcashOption(null);
              setStatus('GCash receipt submitted. The caterer must confirm it before your payment is marked received.');
              await load();
            }}
          />
        )}
      </div>
    </DashboardPage>
  );
}
