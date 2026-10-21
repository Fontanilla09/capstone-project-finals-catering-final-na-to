export default function LoadingSpinner({ fullPage = false, compact = false }) {
  const className = [
    'loading-state',
    fullPage && 'loading-state-full-page',
    compact && 'loading-state-compact',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role="status" aria-label="Loading" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
    </div>
  );
}
