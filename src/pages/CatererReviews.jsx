import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Search, Star } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function imageUrl(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function averageRating(items) {
  if (!items.length) return '—';
  return (items.reduce((sum, review) => sum + Number(review.rating || 0), 0) / items.length).toFixed(1);
}

function eventIcon(eventType = '') {
  const type = eventType.toLowerCase();
  if (type.includes('wedding')) return '💍';
  if (type.includes('corporate') || type.includes('business')) return '💼';
  if (type.includes('christen') || type.includes('bapt')) return '🕊️';
  if (type.includes('graduat')) return '🎓';
  if (type.includes('holiday') || type.includes('christmas')) return '🎄';
  return '🎂';
}

function RatingBreakdown({ reviews }) {
  return (
    <div className="review-rating-breakdown" aria-label="Rating distribution">
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = reviews.filter((review) => Number(review.rating) === rating).length;
        const width = reviews.length ? `${(count / reviews.length) * 100}%` : '0%';
        return (
          <div className="review-rating-row" key={rating}>
            <span>{rating} <Star size={11} fill="currentColor" aria-hidden="true" /></span>
            <div className="review-rating-track"><span style={{ width }} /></div>
            <small>{count}</small>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCards({ reviews, eventType, onViewImage }) {
  if (!reviews.length) {
    return <p className="caterer-reviews-filter-empty">No reviews match these filters.</p>;
  }

  return (
    <div className="caterer-review-list">
      {reviews.map((review) => (
        <article className="caterer-review-card" key={review.review_id}>
          <div className="caterer-review-card-heading">
            <div>
              <strong>{review.customer_name || 'Customer'}</strong>
              <time dateTime={review.created_at}>Reviewed on {formatDate(review.created_at)}</time>
            </div>
            <span className="caterer-review-rating" aria-label={`${review.rating} out of 5 stars`}>
              <span className="caterer-review-stars" aria-hidden="true">
                {'★'.repeat(Number(review.rating || 0))}{'☆'.repeat(5 - Number(review.rating || 0))}
              </span>
              <strong>{Number(review.rating || 0).toFixed(1)}</strong>
            </span>
          </div>
          <div className="caterer-review-event-meta">
            <span>{eventIcon(review.event_type || eventType)} {review.event_type || eventType || 'Event'}</span>
            {review.guest_count && <span>{review.guest_count} guests</span>}
            <span>{formatDate(review.event_date)}</span>
          </div>
          <p className="caterer-review-package-line">
            <strong>Package:</strong> {review.package_name || 'Package unavailable'}
          </p>
          <div className="caterer-review-feedback">
            <span className="caterer-review-section-label">Customer comment</span>
            <p className="caterer-review-text">{review.review_text || 'No written comment.'}</p>
          </div>
          {review.review_image && (
            <button
              className="caterer-review-image-button"
              onClick={() => onViewImage(imageUrl(review.review_image))}
              type="button"
              aria-label="View customer event photo"
            >
              <img className="caterer-review-image" src={imageUrl(review.review_image)} alt="Customer's event" />
              <span><ImageIcon size={14} aria-hidden="true" /> View photo</span>
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

export default function CatererReviews() {
  const [packages, setPackages] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [selectedRating, setSelectedRating] = useState(null);
  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewSort, setReviewSort] = useState('newest');
  const [packageSearch, setPackageSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [packageSort, setPackageSort] = useState('most-reviews');

  useEffect(() => {
    let active = true;

    async function loadReviews() {
      setLoading(true);
      setStatus('');
      try {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data: profileData, error: profileError } = await supabase.rpc('get_my_profile');
        if (profileError) throw profileError;
        const catererId = profileData?.[0]?.caterer_id;
        if (!catererId) throw new Error('Caterer profile not found.');

        const [
          { data: reviewData, error: reviewError },
          { data: packageData, error: packageError },
        ] = await Promise.all([
          supabase.rpc('get_caterer_reviews'),
          supabase.from('packages')
            .select('id, package_name, event_type, package_images(image_path)')
            .eq('caterer_id', catererId)
            .order('id', { ascending: false }),
        ]);
        if (reviewError) throw reviewError;
        if (packageError) throw packageError;
        if (!active) return;
        setReviews(reviewData || []);
        setPackages((packageData || []).map((item) => ({
          ...item,
          image: item.package_images?.[0]?.image_path || '',
        })));

        const { error: markError } = await supabase.rpc('mark_caterer_reviews_read');
        if (markError) throw markError;
        window.dispatchEvent(new Event('caterer-reviews-seen'));
      } catch (error) {
        if (active) setStatus(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReviews();
    return () => { active = false; };
  }, []);

  const selectedPackage = packages.find((item) => String(item.id) === String(selectedPackageId));
  const selectedPackageReviews = selectedPackage
    ? reviews.filter((review) => String(review.package_id) === String(selectedPackage.id))
    : [];
  const displayedReviews = useMemo(() => {
    const search = reviewSearch.trim().toLowerCase();
    return selectedPackageReviews
      .filter((review) => selectedRating === null || Number(review.rating) === selectedRating)
      .filter((review) => feedbackFilter === 'all'
        || (feedbackFilter === 'photos' && Boolean(review.review_image))
        || (feedbackFilter === 'comments' && Boolean(review.review_text?.trim())))
      .filter((review) => !search || [
        review.customer_name,
        review.review_text,
        review.package_name,
        review.event_type,
      ].some((value) => String(value || '').toLowerCase().includes(search)))
      .sort((first, second) => {
        if (reviewSort === 'highest') return Number(second.rating) - Number(first.rating);
        if (reviewSort === 'lowest') return Number(first.rating) - Number(second.rating);
        const dateDifference = new Date(second.created_at) - new Date(first.created_at);
        return reviewSort === 'oldest' ? -dateDifference : dateDifference;
      });
  }, [selectedPackageReviews, selectedRating, feedbackFilter, reviewSearch, reviewSort]);

  const eventTypes = [...new Set(packages.map((item) => item.event_type).filter(Boolean))].sort();
  const packageCards = packages
    .filter((item) => `${item.package_name} ${item.event_type}`.toLowerCase().includes(packageSearch.trim().toLowerCase()))
    .filter((item) => eventFilter === 'all' || item.event_type === eventFilter)
    .map((item) => {
      const packageReviews = reviews.filter((review) => String(review.package_id) === String(item.id));
      return { ...item, reviews: packageReviews, average: averageRating(packageReviews) };
    })
    .sort((first, second) => {
      if (packageSort === 'highest-rated') {
        return Number(second.average) - Number(first.average) || second.reviews.length - first.reviews.length;
      }
      if (packageSort === 'name') return first.package_name.localeCompare(second.package_name);
      return second.reviews.length - first.reviews.length;
    });

  const overallAverage = averageRating(reviews);
  const photoCount = reviews.filter((review) => review.review_image).length;
  const maxMonthlyReviews = Math.max(1, ...Array.from({ length: 6 }, (_, index) => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - (5 - index));
    return reviews.filter((review) => {
      const date = new Date(review.created_at);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    }).length;
  }));
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - (5 - index));
    return {
      label: month.toLocaleDateString('en-PH', { month: 'short' }),
      count: reviews.filter((review) => {
        const date = new Date(review.created_at);
        return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
      }).length,
    };
  });
  const photoPercent = reviews.length ? Math.round((photoCount / reviews.length) * 100) : 0;

  return (
    <DashboardPage role="caterer" section="reviews">
      <section className="caterer-reviews-page">
        <header className="caterer-reviews-header">
          <div>
            <p className="eyebrow">Customer feedback</p>
            <h2>Reviews &amp; Ratings</h2>
            <p>See what customers say about each package and learn what you can improve.</p>
          </div>
        </header>

        {status && <p className="form-alert error-alert" role="alert">{status}</p>}
        {loading ? (
          <LoadingSpinner />
        ) : selectedPackage ? (
          <>
            <button
              className="caterer-review-back-button"
              onClick={() => {
                setSelectedPackageId(null);
                setSelectedRating(null);
                setFeedbackFilter('all');
                setReviewSearch('');
              }}
              type="button"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              All packages
            </button>
            <div className="caterer-review-detail-title">
              <span className="caterer-review-package-art">
                {selectedPackage.image
                  ? <img src={imageUrl(selectedPackage.image)} alt="" />
                  : <span aria-hidden="true">{eventIcon(selectedPackage.event_type)}</span>}
              </span>
              <div>
                <small>{selectedPackage.event_type || 'Catering package'}</small>
                <h3>{selectedPackage.package_name}</h3>
              </div>
            </div>

            <section className="review-analytics-panel" aria-label="Package rating summary">
              <div className="review-analytics-score">
                <strong>{averageRating(selectedPackageReviews)}</strong>
                <span className="review-analytics-stars" aria-label={`${averageRating(selectedPackageReviews)} out of 5 stars`}>
                  {'★'.repeat(Math.round(Number(averageRating(selectedPackageReviews)) || 0))}
                  {'☆'.repeat(5 - Math.round(Number(averageRating(selectedPackageReviews)) || 0))}
                </span>
                <small>{selectedPackageReviews.length} review{selectedPackageReviews.length === 1 ? '' : 's'}</small>
              </div>
              <RatingBreakdown reviews={selectedPackageReviews} />
              <div className="review-analytics-side">
                <div><strong>{selectedPackageReviews.length ? `${Math.round((selectedPackageReviews.filter((review) => review.review_text?.trim()).length / selectedPackageReviews.length) * 100)}%` : '0%'}</strong><span>With comments</span></div>
                <div><strong>{photoPercentFor(selectedPackageReviews)}%</strong><span>With photos</span></div>
              </div>
            </section>

            <div className="caterer-review-filter-chips" aria-label="Filter package reviews">
              <button className={selectedRating === null && feedbackFilter === 'all' ? 'active' : ''} onClick={() => { setSelectedRating(null); setFeedbackFilter('all'); }} type="button">All <span>{selectedPackageReviews.length}</span></button>
              {[5, 4, 3, 2, 1].map((rating) => (
                <button className={selectedRating === rating ? 'active' : ''} key={rating} onClick={() => { setSelectedRating(selectedRating === rating ? null : rating); setFeedbackFilter('all'); }} type="button" aria-pressed={selectedRating === rating}>
                  {rating} ★ <span>{selectedPackageReviews.filter((review) => Number(review.rating) === rating).length}</span>
                </button>
              ))}
              <button className={feedbackFilter === 'photos' ? 'active' : ''} onClick={() => { setFeedbackFilter(feedbackFilter === 'photos' ? 'all' : 'photos'); setSelectedRating(null); }} type="button">With photos <span>{selectedPackageReviews.filter((review) => review.review_image).length}</span></button>
              <button className={feedbackFilter === 'comments' ? 'active' : ''} onClick={() => { setFeedbackFilter(feedbackFilter === 'comments' ? 'all' : 'comments'); setSelectedRating(null); }} type="button">With comments <span>{selectedPackageReviews.filter((review) => review.review_text?.trim()).length}</span></button>
            </div>

            <div className="caterer-review-toolbar">
              <label className="caterer-review-search">
                <Search size={16} aria-hidden="true" />
                <input aria-label="Search customer reviews" onChange={(event) => setReviewSearch(event.target.value)} placeholder="Search comments or customers..." type="search" value={reviewSearch} />
              </label>
              <label className="caterer-review-sort">
                <span className="sr-only">Sort reviews</span>
                <select onChange={(event) => setReviewSort(event.target.value)} value={reviewSort}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </label>
              <span className="caterer-review-result-count">{displayedReviews.length} of {selectedPackageReviews.length} reviews</span>
            </div>
            <ReviewCards reviews={displayedReviews} eventType={selectedPackage.event_type} onViewImage={setSelectedImage} />
          </>
        ) : (
          <>
            <section className="review-analytics-panel" aria-label="Overall ratings summary">
              <div className="review-analytics-score">
                <strong>{overallAverage}</strong>
                <span className="review-analytics-stars" aria-label={`${overallAverage} out of 5 stars`}>
                  {'★'.repeat(Math.round(Number(overallAverage) || 0))}{'☆'.repeat(5 - Math.round(Number(overallAverage) || 0))}
                </span>
                <small>{reviews.length} review{reviews.length === 1 ? '' : 's'}</small>
              </div>
              <RatingBreakdown reviews={reviews} />
              <div className="review-analytics-side">
                <div><strong>{reviews.length ? `${Math.round((reviews.filter((review) => review.review_text?.trim()).length / reviews.length) * 100)}%` : '0%'}</strong><span>With comments</span></div>
                <div><strong>{photoPercent}%</strong><span>With photos</span></div>
                <div className="review-trend"><small>6-month trend</small><div>{monthlyTrend.map((month, index) => (
                  <span key={`${month.label}-${index}`} title={`${month.label}: ${month.count} reviews`}>
                    <i style={{ height: month.count ? `${Math.max(8, (month.count / maxMonthlyReviews) * 100)}%` : '0%' }} />
                    <small>{month.label}</small>
                  </span>
                ))}</div></div>
              </div>
            </section>

            {packages.length ? (
              <>
                <div className="caterer-review-package-toolbar">
                  <label className="caterer-review-search">
                    <Search size={16} aria-hidden="true" />
                    <input aria-label="Search packages" onChange={(event) => setPackageSearch(event.target.value)} placeholder="Search package..." type="search" value={packageSearch} />
                  </label>
                  <label>
                    <span className="sr-only">Filter packages by event type</span>
                    <select onChange={(event) => setEventFilter(event.target.value)} value={eventFilter}>
                      <option value="all">All event types</option>
                      {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Sort packages</span>
                    <select onChange={(event) => setPackageSort(event.target.value)} value={packageSort}>
                      <option value="most-reviews">Most reviews</option>
                      <option value="highest-rated">Highest rated</option>
                      <option value="name">Package name</option>
                    </select>
                  </label>
                  <span>{packageCards.length} of {packages.length} packages</span>
                </div>
                {packageCards.length ? (
                  <div className="caterer-review-packages" aria-label="Packages and ratings">
                    {packageCards.map((item) => (
                      <button
                        className="caterer-review-package-card"
                        key={item.id}
                        onClick={() => {
                          setSelectedPackageId(item.id);
                          setSelectedRating(null);
                          setFeedbackFilter('all');
                          setReviewSearch('');
                        }}
                        type="button"
                      >
                        <span className="caterer-review-package-art">
                          {item.image
                            ? <img src={imageUrl(item.image)} alt="" />
                            : <span aria-hidden="true">{eventIcon(item.event_type)}</span>}
                        </span>
                        <span className="caterer-review-package-card-copy">
                          <small>{item.event_type || 'Catering package'}</small>
                          <strong>{item.package_name}</strong>
                          <span className="caterer-review-package-card-rating">
                            <span aria-hidden="true">{item.reviews.length ? '★★★★★' : '☆☆☆☆☆'}</span>
                            <strong>{item.average}</strong>
                          </span>
                          <small>{item.reviews.length} rating{item.reviews.length === 1 ? '' : 's'}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="caterer-reviews-filter-empty">No packages match your search.</p>
                )}
              </>
            ) : (
              <div className="caterer-reviews-empty">
                <Star size={26} aria-hidden="true" />
                <h3>No packages yet</h3>
                <p>Create a package first; its customer ratings and reviews will appear here.</p>
              </div>
            )}
          </>
        )}
      </section>
      {selectedImage && (
        <div className="caterer-review-image-overlay" role="presentation" onClick={() => setSelectedImage(null)}>
          <button className="caterer-review-image-close" onClick={() => setSelectedImage(null)} type="button">Close</button>
          <img src={selectedImage} alt="Customer's event enlarged" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </DashboardPage>
  );
}

function photoPercentFor(items) {
  return items.length
    ? Math.round((items.filter((review) => review.review_image).length / items.length) * 100)
    : 0;
}
