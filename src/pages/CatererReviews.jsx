import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

function imageUrl(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function CatererReviews() {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedRating, setSelectedRating] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadReviews() {
      setLoading(true);
      setStatus('');
      try {
        const { data, error } = await supabase.rpc('get_caterer_reviews');
        if (error) throw error;
        if (!active) return;
        setReviews(data || []);

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

  const averageRating = reviews.length
    ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : '—';
  const filteredReviews = selectedRating === null
    ? reviews
    : reviews.filter((review) => Number(review.rating) === selectedRating);

  return (
    <DashboardPage role="caterer" section="reviews">
      <section className="caterer-reviews-page">
        <header className="caterer-reviews-header">
          <div>
            <p className="eyebrow">Customer feedback</p>
            <h2>Reviews &amp; Ratings</h2>
            <p>View each customer's rating, package, comments, and event photo.</p>
          </div>
          <div className="caterer-reviews-summary">
            <strong><Star size={19} fill="currentColor" aria-hidden="true" /> {averageRating}</strong>
            <span>{reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
          </div>
        </header>

        {status && <p className="form-alert error-alert" role="alert">{status}</p>}
        {loading ? (
          <p className="muted-label">Loading reviews...</p>
        ) : reviews.length ? (
          <>
            <div className="caterer-review-filters" aria-label="Filter reviews by star rating">
              <span>Filter by rating</span>
              <div>
                <button
                  className={selectedRating === null ? 'active' : ''}
                  onClick={() => setSelectedRating(null)}
                  type="button"
                  aria-pressed={selectedRating === null}
                >
                  All ({reviews.length})
                </button>
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = reviews.filter((review) => Number(review.rating) === rating).length;
                  return (
                    <button
                      className={selectedRating === rating ? 'active' : ''}
                      key={rating}
                      onClick={() => setSelectedRating(rating)}
                      type="button"
                      aria-pressed={selectedRating === rating}
                    >
                      {'★'.repeat(rating)} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
            {filteredReviews.length ? (
              <div className="caterer-review-list">
                {filteredReviews.map((review) => (
              <article className="caterer-review-card" key={review.review_id}>
                <div className="caterer-review-card-heading">
                  <div>
                    <strong>{review.customer_name || 'Customer'}</strong>
                    <time dateTime={review.created_at}>Reviewed on {formatDate(review.created_at)}</time>
                  </div>
                  <span className="caterer-review-rating" aria-label={`${review.rating} stars`}>
                    <span className="caterer-review-stars" aria-hidden="true">
                      {'★'.repeat(Number(review.rating || 0))}{'☆'.repeat(5 - Number(review.rating || 0))}
                    </span>
                  </span>
                </div>
                <div className="caterer-review-package">
                  <span>Rated package</span>
                  <strong>{review.package_name || 'Package unavailable'}</strong>
                  <small>Event date: {formatDate(review.event_date)}</small>
                </div>
                <div className="caterer-review-feedback">
                  <span className="caterer-review-section-label">Customer comment</span>
                  <p className="caterer-review-text">{review.review_text || 'No written comment.'}</p>
                </div>
                {review.review_image && (
                  <button
                    className="caterer-review-image-button"
                    onClick={() => setSelectedImage(imageUrl(review.review_image))}
                    type="button"
                    aria-label="View customer event photo"
                  >
                    <img className="caterer-review-image" src={imageUrl(review.review_image)} alt="Customer's event" />
                    <span>View photo</span>
                  </button>
                )}
              </article>
                ))}
              </div>
            ) : (
              <p className="caterer-reviews-filter-empty">There are no {selectedRating}-star reviews.</p>
            )}
          </>
        ) : !status ? (
          <div className="caterer-reviews-empty">
            <Star size={26} aria-hidden="true" />
            <h3>No reviews yet</h3>
            <p>Customer ratings and feedback will appear here after they review a completed event.</p>
          </div>
        ) : null}
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
