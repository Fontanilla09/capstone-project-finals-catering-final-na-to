import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getUnavailableCatererIds } from '../lib/catererAvailability';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportProof, setReportProof] = useState(null);
  const [reportProofPreview, setReportProofPreview] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('packages')
          .select('id, package_name, event_type, price, description, includes, caterer_id, caterers!inner(id, business_name, city, rating, is_verified), package_images(image_path)')
          .eq('id', packageId)
          .eq('caterer_id', query.get('caterer') || '')
          .eq('caterers.is_verified', true)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Package not found.');

        const catererId = data.caterers?.id;
        const [unavailableCatererIds, { data: reviews, error: reviewsError }] = await Promise.all([
          getUnavailableCatererIds(),
          catererId
          ? await supabase
              .from('reviews')
              .select('id, rating, review_text, review_image, created_at, reservations!inner(package_id)')
              .eq('reservations.package_id', packageId)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        ]);

        if (reviewsError) throw reviewsError;
        const packageRating = reviews?.length
          ? (reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
          : null;

        setItem({
          ...data,
          business_name: data.caterers?.business_name,
          city: data.caterers?.city,
          rating: packageRating,
          review_count: reviews?.length || 0,
          caterer_id: data.caterers?.id,
          is_full: unavailableCatererIds.has(String(catererId)) ? 1 : 0,
          images: (data.package_images || []).map((image) => image.image_path),
          booking_count: 0,
          reviews: (reviews || []).map((review) => ({
            ...review,
            full_name: 'Customer',
          })),
        });
      } catch (reason) { setError(reason.message); }
    }
    load();
  }, [packageId]);

  useEffect(() => {
    if (!reportProof) {
      setReportProofPreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(reportProof);
    setReportProofPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [reportProof]);

  if (error) return <main className="packages-page"><p className="package-empty">{error}</p></main>;
  if (!item) return <main className="packages-page" aria-busy="true"><LoadingSpinner fullPage /></main>;

  async function submitReport(event) {
    event.preventDefault();
    setReportStatus('');
    setReportSubmitting(true);
    let uploadedProofPath = '';
    try {
      const { data: profile, error: profileError } = await supabase.rpc('get_my_profile');
      if (profileError) throw profileError;
      const customer = profile?.[0];
      if (!customer || customer.role !== 'customer' || !customer.customer_id) {
        throw new Error('Sign in with a customer account to submit a report.');
      }
      if (!reportReason) throw new Error('Choose a reason for your report.');
      if (reportDetails.trim().length < 10) throw new Error('Please provide at least 10 characters of detail.');

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in to submit a report.');
      if (reportProof && reportProof.size > 5 * 1024 * 1024) {
        throw new Error('The proof image must be 5 MB or smaller.');
      }
      if (reportProof && !['image/jpeg', 'image/png', 'image/webp'].includes(reportProof.type)) {
        throw new Error('Upload a JPG, PNG, or WEBP proof image.');
      }
      let proofImagePath = null;
      if (reportProof) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[reportProof.type];
        uploadedProofPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('customer-report-proofs')
          .upload(uploadedProofPath, reportProof, { contentType: reportProof.type, upsert: false });
        if (uploadError) throw uploadError;
        proofImagePath = uploadedProofPath;
      }
      const { error: insertError } = await supabase.from('customer_reports').insert({
        customer_id: customer.customer_id,
        reporter_name: customer.display_name || 'Customer',
        reporter_email: authData.user?.email || null,
        target_type: 'caterer',
        target_name: item.business_name,
        caterer_id: item.caterer_id,
        package_id: null,
        reason: reportReason,
        details: reportDetails.trim(),
        proof_image_path: proofImagePath,
      });
      if (insertError) {
        if (uploadedProofPath) {
          const { error: cleanupError } = await supabase.storage
            .from('customer-report-proofs')
            .remove([uploadedProofPath]);
          if (cleanupError) {
            throw new Error(`${insertError.message} The uploaded proof could not be cleaned up: ${cleanupError.message}`);
          }
        }
        throw insertError;
      }

      setReportOpen(false);
      setReportReason('');
      setReportDetails('');
      setReportProof(null);
      setReportStatus('Thank you. Your report was sent to the admin team for review.');
    } catch (reason) {
      setReportStatus(reason.message || 'Unable to submit your report.');
    } finally {
      setReportSubmitting(false);
    }
  }

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
          <p className="product-rating">★ {item.rating || 'New'} <span>·</span> {item.review_count} package review{item.review_count === 1 ? '' : 's'}</p>
          <div className="product-price">₱{Number(item.price).toLocaleString()}</div>
          <div className="product-meta"><span>Booking</span><strong>{Number(item.is_full) === 1 ? 'Caterer fully booked' : 'Available by request'}</strong></div>
          <div className="product-seller"><span>Prepared by</span><strong>{item.business_name}</strong><small>{item.city || 'Local caterer'}</small></div>
          <div className="product-actions">
            <div className="product-action-row">
              {Number(item.is_full) === 1
                ? <strong className="package-full-label">Caterer fully booked</strong>
                : <a className="button button-primary" href={`/book?package=${item.id}&caterer=${item.caterer_id}`}>Request booking <span>↗</span></a>}
              <button
                aria-label={`Report ${item.business_name} to the admin`}
                className="caterer-report-button"
                onClick={() => { setReportOpen(true); setReportStatus(''); }}
                title="Report this caterer"
                type="button"
              >
                <Flag aria-hidden="true" size={17} />
              </button>
            </div>
            <p className="booking-message">Have questions about this package? <a href={`/dashboard/messages?package_id=${item.id}&caterer_id=${item.caterer_id}`}>Message the caterer</a>.</p>
            {reportStatus && !reportOpen && <p className="package-report-success" role="status">{reportStatus}</p>}
          </div>
        </article>
      </div>
      <article className="package-info-panel"><h2>About this package</h2><p>{item.description || 'A thoughtfully prepared package for your gathering.'}</p><h3>Includes</h3>{includes.length ? <ul>{includes.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Contact the caterer for the complete package details.</p>}</article><section className="package-reviews"><div className="package-reviews-heading"><h2>Customer reviews</h2><strong>★ {item.rating || 'New'} <span>{item.review_count} package review{item.review_count === 1 ? '' : 's'}</span></strong></div>{item.reviews?.length ? <div className="review-list">{item.reviews.map((review, index) => <article className="review-card" key={`${review.created_at}-${index}`}><strong>{review.full_name}</strong><span className="review-stars">{'★'.repeat(Number(review.rating))}</span>{review.review_text && <p>{review.review_text}</p>}{review.review_image && <img className="review-image" src={imageUrl(review.review_image)} alt="Customer review" />}</article>)}</div> : <p className="muted-label">No customer reviews yet.</p>}</section>
    </section>
    {reportOpen && <div className="account-reject-overlay" role="presentation" onClick={() => setReportOpen(false)}><form className="account-reject-form package-report-form" onSubmit={submitReport} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="package-report-title"><header><div><p className="eyebrow">Customer support</p><h3 id="package-report-title">Report an issue</h3><p>Tell our admin team what needs review. Reports are private.</p></div></header><p className="reporting-caterer"><strong>Caterer:</strong> {item.business_name}</p><label htmlFor="report-reason">Reason</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} required><option value="">Select a reason</option><option value="Misleading information">Misleading information</option><option value="Inappropriate content">Inappropriate content</option><option value="Unprofessional conduct">Unprofessional conduct</option><option value="Suspected scam">Suspected scam</option><option value="Other">Other</option></select><label htmlFor="report-details">What happened?</label><textarea id="report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} minLength={10} maxLength={2000} required placeholder="Share details that can help us review this report." /><label htmlFor="report-proof">Proof image (optional)</label><input id="report-proof" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setReportProof(file); setReportStatus(''); }} type="file" />{reportProofPreview && <div className="report-proof-preview"><img src={reportProofPreview} alt="Selected proof preview" /><div><strong>{reportProof.name}</strong><small>{(reportProof.size / 1024 / 1024).toFixed(2)} MB · JPG, PNG, or WEBP</small><button className="package-report-link" onClick={() => { setReportProof(null); setReportStatus(''); }} type="button">Remove image</button></div></div>}<small className="report-upload-hint">Maximum 5 MB. Only the customer who submitted the report and admins can view the image.</small>{reportStatus && <p className="form-alert error-alert" role="alert">{reportStatus}</p>}<div className="account-reject-footer"><button className="button button-secondary" onClick={() => setReportOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={reportSubmitting} type="submit">{reportSubmitting ? 'Sending...' : 'Submit report'}</button></div></form></div>}
    {selectedImage && <div className="image-lightbox" role="presentation" onClick={() => setSelectedImage(null)}><button className="image-lightbox-close" type="button" aria-label="Close image viewer" onClick={() => setSelectedImage(null)}>Close</button><img src={imageUrl(selectedImage)} alt={`${item.package_name} enlarged sample`} onClick={(event) => event.stopPropagation()} /></div>}
  </main>;
}
