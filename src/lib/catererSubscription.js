let cachedStatus = null;

export function getCachedCatererSubscription() {
  if (!cachedStatus?.active) return null;

  if (
    Date.parse(cachedStatus.subscription?.expires_at || '') <= Date.now()
  ) {
    cachedStatus = { ...cachedStatus, active: false };
    return null;
  }

  return cachedStatus;
}

export function cacheCatererSubscription(result) {
  const subscription = result.subscription || null;
  const expiryTimestamp = typeof subscription?.expires_at === 'string'
    ? Date.parse(subscription.expires_at)
    : Number.NaN;

  if (result.active === true && !Number.isFinite(expiryTimestamp)) {
    throw new Error('The active subscription expiry could not be verified. Please contact support.');
  }

  cachedStatus = {
    active: result.active === true && expiryTimestamp > Date.now(),
    subscription,
  };

  return cachedStatus;
}

export function clearCachedCatererSubscription() {
  cachedStatus = null;
}
