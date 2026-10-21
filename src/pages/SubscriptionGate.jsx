import { useCallback, useEffect, useState } from 'react';
import { Check, Image, LoaderCircle, LockKeyhole, Package, Sparkles, X } from 'lucide-react';
import DashboardPage from '../components/DashboardPage.jsx';
import ManageServices from './ManageServices.jsx';
import AiGeneratedPhoto from './AiGeneratedPhoto.jsx';
import { requestJson } from '../lib/api.js';

const planOptions = [
  { id: 'monthly', label: 'Monthly', price: '₱1', detail: 'One-time payment · 1 month' },
  { id: 'yearly', label: 'Yearly', price: '₱4,790', detail: 'One-time payment · 1 year', savings: 'Save 20%' },
];

const featureCopy = {
  services: {
    title: 'Subscribe to manage your packages',
    description: 'Add packages, set prices, and show your catalog to customers.',
    pageTitle: 'Your package catalog',
    pageDescription: 'Create and organize the packages customers can book.',
  },
  'ai-photos': {
    title: 'Subscribe to generate AI photos',
    description: 'Make polished catering photos for your packages in seconds.',
    pageTitle: 'Create visuals for your next event',
    pageDescription: 'Describe a scene and create polished package imagery.',
  },
};

function LockedPreview({ feature }) {
  const isServices = feature === 'services';
  return (
    <div className="subscription-preview-content" aria-hidden="true">
      <div className="subscription-preview-heading">
        <div>
          <p className="eyebrow">{isServices ? 'Services' : 'CaterAI image studio'}</p>
          <h2>{featureCopy[feature].pageTitle}</h2>
          <p>{featureCopy[feature].pageDescription}</p>
        </div>
        <span className="subscription-preview-action">{isServices ? '+ Add package' : '✦ Generate image'}</span>
      </div>
      {isServices ? (
        <div className="subscription-preview-cards">
          {[1, 2, 3].map((item) => (
            <article key={item}>
              <span className="subscription-preview-thumbnail"><Package size={22} /></span>
              <span className="subscription-preview-line subscription-preview-line-long" />
              <span className="subscription-preview-line" />
              <span className="subscription-preview-price" />
            </article>
          ))}
        </div>
      ) : (
        <div className="subscription-preview-ai">
          <div><Sparkles size={30} /><span className="subscription-preview-line subscription-preview-line-long" /><span className="subscription-preview-line" /></div>
          <div><Image size={42} /></div>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionGate({ feature }) {
  const [modalOpen, setModalOpen] = useState(true);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [subscription, setSubscription] = useState(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const details = featureCopy[feature] || featureCopy.services;
  const checkoutResult = new URLSearchParams(window.location.search).get('subscription');

  const refreshSubscription = useCallback(async ({ background = false, signal } = {}) => {
    if (!background) {
      setStatusError('');
      setStatusLoading(true);
    }
    try {
      const result = await requestJson('/backend/subscription_api.php', { signal });
      const active = result.active === true;
      const expiresAt = result.subscription?.expires_at;
      const expiryTimestamp = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;
      if (active && !Number.isFinite(expiryTimestamp)) {
        setHasActiveSubscription(false);
        setSubscription(null);
        setStatusError('The active subscription expiry could not be verified. Please contact support.');
        return null;
      }
      const isActive = active && expiryTimestamp > Date.now();
      setHasActiveSubscription(isActive);
      setSubscription(result.subscription || null);
      return isActive;
    } catch (error) {
      setHasActiveSubscription(false);
      setSubscription(null);
      setStatusError(error.message || 'Subscription status could not be checked.');
      return null;
    } finally {
      if (!background) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const deadline = Date.now() + 120000;

    async function checkSubscription(isBackground = false) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const active = await refreshSubscription({ background: isBackground, signal: controller.signal });
      window.clearTimeout(timeout);

      if (
        cancelled
        || active === true
        || active === null
        || checkoutResult !== 'success'
        || Date.now() >= deadline
      ) return;
      timer = window.setTimeout(() => checkSubscription(true), 3000);
    }

    checkSubscription();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkoutResult, refreshSubscription]);

  useEffect(() => {
    if (checkoutResult !== 'success' || hasActiveSubscription) return undefined;

    const timeout = window.setTimeout(() => {
      setStatusError((currentError) => currentError || 'Payment is not confirmed yet. Do not pay again. Contact support to verify this payment.');
    }, 120000);
    return () => window.clearTimeout(timeout);
  }, [checkoutResult, hasActiveSubscription]);

  useEffect(() => {
    if (!hasActiveSubscription || !subscription?.expires_at) return undefined;
    const expiresAt = Date.parse(subscription.expires_at);
    if (!Number.isFinite(expiresAt)) {
      setHasActiveSubscription(false);
      setSubscription(null);
      setStatusError('The subscription expiry date could not be read. Please refresh subscription status.');
      return undefined;
    }

    const delay = Math.min(Math.max(expiresAt - Date.now() + 250, 0), 2147483647);
    const timer = window.setTimeout(refreshSubscription, delay);
    return () => window.clearTimeout(timer);
  }, [hasActiveSubscription, refreshSubscription, subscription]);

  async function startCheckout() {
    setCheckoutError('');
    setCheckoutLoading(true);
    try {
      const result = await requestJson('/backend/subscription_api.php', {
        method: 'POST',
        body: JSON.stringify({ plan: selectedPlan }),
      });
      if (typeof result.checkout_url !== 'string' || !result.checkout_url) {
        throw new Error('PayMongo did not return a checkout link.');
      }
      window.location.assign(result.checkout_url);
    } catch (error) {
      setCheckoutError(error.message || 'Could not start checkout. Please try again.');
      setCheckoutLoading(false);
    }
  }

  useEffect(() => {
    if (!modalOpen || hasActiveSubscription) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        if (planPickerOpen) setPlanPickerOpen(false);
        else setModalOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [hasActiveSubscription, modalOpen, planPickerOpen]);

  if (hasActiveSubscription) {
    return feature === 'ai-photos' ? <AiGeneratedPhoto /> : <ManageServices />;
  }

  return (
    <DashboardPage role="caterer" section={feature}>
      <div className={`subscription-gate${modalOpen ? ' is-modal-open' : ''}`}>
        <div className="subscription-preview">
          <LockedPreview feature={feature} />
          <button className="button button-primary subscription-reopen" onClick={() => setModalOpen(true)} type="button">
            <LockKeyhole size={15} aria-hidden="true" /> View subscription plans
          </button>
        </div>
        {modalOpen && (
          <div className="subscription-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              if (planPickerOpen) setPlanPickerOpen(false);
              else setModalOpen(false);
            }
          }}>
            {planPickerOpen ? (
              <section className="subscription-modal subscription-plan-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-plan-title">
                <button className="subscription-modal-close" onClick={() => setPlanPickerOpen(false)} type="button" aria-label="Back to subscription details">
                  <X size={18} />
                </button>
                <p className="eyebrow">CaterAI Pro</p>
                <h2 id="subscription-plan-title">Choose your plan</h2>
                <div className="subscription-plan-options" aria-label="Subscription plan options">
                  {planOptions.map((plan) => (
                    <button
                      aria-pressed={selectedPlan === plan.id}
                      className={`subscription-plan-option${selectedPlan === plan.id ? ' is-selected' : ''}`}
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      type="button"
                    >
                      <span><strong>{plan.label}</strong><small>{plan.detail}</small></span>
                      <strong>{plan.price}</strong>
                      {plan.savings && <em>{plan.savings}</em>}
                    </button>
                  ))}
                </div>
                {checkoutError && <p className="subscription-feedback is-error" role="alert">{checkoutError}</p>}
                {statusError && <p className="subscription-feedback is-error" role="alert">{statusError}</p>}
                {checkoutResult === 'success' && (
                  <p className="subscription-feedback" role="status">
                    Checkout returned successfully. Access unlocks after PayMongo confirms payment.
                  </p>
                )}
                <button className="subscription-primary-action" disabled={checkoutLoading} onClick={startCheckout} type="button">
                  {checkoutLoading ? <><LoaderCircle size={16} className="subscription-spinner" /> Connecting to PayMongo…</> : `Continue with QR Ph · ${planOptions.find((plan) => plan.id === selectedPlan)?.price}`}
                </button>
                <small className="subscription-checkout-note">Secure PayMongo checkout using QR Ph. Features unlock after payment is verified.</small>
              </section>
            ) : (
              <section className="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-modal-title">
              <button className="subscription-modal-close" onClick={() => setModalOpen(false)} type="button" aria-label="Close subscription dialog">
                <X size={18} />
              </button>
              <span className="subscription-lock-icon"><LockKeyhole size={21} aria-hidden="true" /></span>
              <p className="eyebrow">CaterAI Pro</p>
              <h2 id="subscription-modal-title">{details.title}</h2>
              <p className="subscription-modal-description">{details.description}</p>
              <ul className="subscription-benefits">
                <li><Check size={15} aria-hidden="true" /> Manage your package catalog</li>
                <li><Check size={15} aria-hidden="true" /> Generate AI photos for your event themes</li>
                <li><Check size={15} aria-hidden="true" /> One-time QR Ph checkout with access duration by plan</li>
              </ul>
              {statusLoading && <p className="subscription-feedback" role="status">Checking subscription status…</p>}
              {statusError && <p className="subscription-feedback is-error" role="alert">{statusError}</p>}
              {!statusLoading && subscription?.status === 'pending' && (
                <p className="subscription-feedback" role="status">A payment is awaiting PayMongo confirmation. Refresh status after completing checkout.</p>
              )}
              <button className="subscription-primary-action" onClick={() => setPlanPickerOpen(true)} type="button">
                Subscribe from ₱1/month
              </button>
              <small className="subscription-checkout-note">Choose a 1-month or 1-year plan. Your data stays safe while locked.</small>
              </section>
            )}
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
