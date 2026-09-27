import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

function imageUrl(path) {
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

export default function PackageDetails() {
  const packageId = window.location.pathname.split('/').pop();
  const query = new URLSearchParams(window.location.search);
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('packages')
          .select('id, package_name, event_type, price, guest_count_min, guest_count_max, description, includes, caterer_id, caterers!inner(id, business_name, city, rating, is_verified), package_images(image_path)')
          .eq('id', packageId)
          .eq('caterer_id', query.get('caterer') || '')
          .eq('caterers.is_verified', true)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Package not found.');
        setItem({
          ...data,
          business_name: data.caterers?.business_name,
          city: data.caterers?.city,
          rating: data.caterers?.rating,
          caterer_id: data.caterers?.id,
          images: (data.package_images || []).map((image) => image.image_path),
          booking_count: 0,
          reviews: [],
        });
      } catch (reason) { setError(reason.message); }
    }
    load();
  }, [packageId]);

  if (error) return <main className="packages-page"><p className="package-empty">{error}</p></main>;
  if (!item) return <main className="packages-page"><p className="package-empty">Loading package...</p></main>;

  const includes = (item.includes || '').split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
  const images = item.images || [];
  const mainImage = activeImage || images[0];

  return <main className="packages-page">
    <nav className="packages-nav"><a className="brand" href="/">Cater<span>AI</span></a><a href="/packages">All packages</a></nav>
    <section className="package-detail-content">
      <a className="text-link" href="/packages">← Back to packages</a>
      <div className="product-layout">
        <div className="product-media">
          {mainImage ? <button className="package-main-image" type="button" onClick={() => setSelectedImage(mainImage)}><img src={imageUrl(mainImage)} alt={`${item.package_name} selected sample`} /></button> : <div className="package-main-image package-main-image-empty">No sample photo yet</div>}
          {images.length > 0 && <div className="package-thumbnails">{images.map((image) => <button className={image === mainImage ? 'package-thumbnail active' : 'package-thumbnail'} key={image} type="button" onMouseEnter={() => setActiveImage(image)} onFocus={() => setActiveImage(image)} onClick={() => setActiveImage(image)}><img src={imageUrl(image)} alt={`${item.package_name} thumbnail`} /></button>)}</div>}
        </div>
        <article className="product-summary">
          <p className="eyebrow">{item.event_type || 'Catering package'}</p>
          <h1>{item.package_name}</h1>
          <p className="product-rating">★ {item.rating || 'New'} <span>·</span> Local catering service</p>
          <div className="product-price">₱{Number(item.price).toLocaleString()}</div>
          <div className="product-meta"><span>Guest capacity</span><strong>{item.guest_count_min}-{item.guest_count_max} guests</strong></div><div className="product-meta"><span>Booking</span><strong>Available by request</strong></div>
          <div className="product-seller"><span>Prepared by</span><strong>{item.business_name}</strong><small>{item.city || 'Local caterer'}</small></div>
          <div className="product-actions">{Number(item.is_full) === 1 ? <strong className="package-full-label">Package full</strong> : <a className="button button-primary" href={`/book?package=${item.id}&caterer=${item.caterer_id}`}>Request booking <span>↗</span></a>}<p className="booking-message">Have questions about this package? <a href={`/dashboard/messages?package_id=${item.id}&caterer_id=${item.caterer_id}`}>Message the caterer</a>.</p></div>
        </article>
      </div>
      <article className="package-info-panel"><h2>About this package</h2><p>{item.description || 'A thoughtfully prepared package for your gathering.'}</p><h3>Includes</h3>{includes.length ? <ul>{includes.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Contact the caterer for the complete package details.</p>}</article><section className="package-reviews"><div className="package-reviews-heading"><h2>Customer reviews</h2><strong>★ {item.rating || 'New'} <span>{item.reviews?.length || 0} review{item.reviews?.length === 1 ? '' : 's'}</span></strong></div>{item.reviews?.length ? <div className="review-list">{item.reviews.map((review, index) => <article className="review-card" key={`${review.created_at}-${index}`}><strong>{review.full_name}</strong><span className="review-stars">{'★'.repeat(Number(review.rating))}</span>{review.review_text && <p>{review.review_text}</p>}{review.review_image && <img className="review-image" src={`${API_BASE}${review.review_image}`} alt="Customer review" />}</article>)}</div> : <p className="muted-label">No customer reviews yet.</p>}</section>
    </section>
    {selectedImage && <div className="image-lightbox" role="presentation" onClick={() => setSelectedImage(null)}><button className="image-lightbox-close" type="button" aria-label="Close image viewer" onClick={() => setSelectedImage(null)}>Close</button><img src={imageUrl(selectedImage)} alt={`${item.package_name} enlarged sample`} onClick={(event) => event.stopPropagation()} /></div>}
  </main>;
}
