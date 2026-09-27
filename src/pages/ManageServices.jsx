import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { EVENT_TYPES } from '../lib/eventTypes';
import DashboardPage from '../components/DashboardPage.jsx';

const initialForm = { package_name: '', event_type: '', guest_range: '', price: '', description: '', features: '' };

function imageUrl(path) {
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

export default function ManageServices() {
  const [services, setServices] = useState([]); const [form, setForm] = useState(initialForm); const [images, setImages] = useState([]); const [editingId, setEditingId] = useState(null); const [status, setStatus] = useState('');
  async function getCatererId() {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error || !data?.[0]?.caterer_id) throw new Error('Caterer profile not found.');
    return data[0].caterer_id;
  }

  async function load() {
    try {
      const catererId = await getCatererId();
      const { data, error } = await supabase.from('packages').select('id, package_name, event_type, price, guest_count_min, guest_count_max, description, includes, package_images(image_path)').eq('caterer_id', catererId).order('id', { ascending: false });
      if (error) throw error;
      setServices((data || []).map((service) => ({ ...service, image_paths: (service.package_images || []).map((image) => image.image_path).join('||'), booking_count: 0, rating: 0, review_count: 0, review_comments: '' })));
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  async function create(event) {
    event.preventDefault();
    const wasEditing = Boolean(editingId);
    try {
      const catererId = await getCatererId();
      const parts = form.guest_range.replace(/\s+/g, '').split('-');
      const guestMin = Number(parts[0]);
      const guestMax = Number(parts[1] || parts[0]);
      const payload = { package_name: form.package_name.trim(), event_type: form.event_type.trim(), guest_count_min: guestMin, guest_count_max: guestMax, price: Number(form.price), description: form.description.trim(), includes: form.features.trim(), caterer_id: catererId };
      if (!payload.package_name || !payload.event_type || guestMin <= 0 || guestMax <= 0 || payload.price <= 0) throw new Error('Complete the service fields with a valid guest range and price.');
      const query = wasEditing
        ? supabase.from('packages').update(payload).eq('id', editingId).eq('caterer_id', catererId).select('id').single()
        : supabase.from('packages').insert(payload).select('id').single();
      const { data, error } = await query;
      if (error) throw error;
      const packageId = wasEditing ? editingId : data.id;
      for (const image of images) {
        const path = `${catererId}/${packageId}/${crypto.randomUUID()}-${image.name}`;
        const { error: uploadError } = await supabase.storage.from('package-images').upload(path, image, { contentType: image.type });
        if (uploadError) throw uploadError;
        const { data: publicImage } = supabase.storage.from('package-images').getPublicUrl(path);
        const { error: imageError } = await supabase.from('package_images').insert({ package_id: packageId, image_path: publicImage.publicUrl });
        if (imageError) throw imageError;
      }
      setForm(initialForm); setImages([]); setEditingId(null); setStatus(wasEditing ? 'Service updated.' : 'Service created.'); load();
    } catch (error) { setStatus(error.message); }
  }
  async function remove(id) { try { const catererId = await getCatererId(); const { error } = await supabase.from('packages').delete().eq('id', id).eq('caterer_id', catererId); if (error) throw error; setStatus('Service deleted.'); load(); } catch (error) { setStatus(error.message); } }
  function edit(service) { setEditingId(service.id); setImages([]); setForm({ package_name: service.package_name, event_type: service.event_type, guest_range: `${service.guest_count_min}-${service.guest_count_max}`, price: service.price, description: service.description || '', features: service.includes || '' }); }
  const fields = [['package_name', 'Package name'], ['event_type', 'Event type'], ['guest_range', 'Guest range, e.g. 50-100'], ['price', 'Price']];
  return <DashboardPage role="caterer" section="services"><div className="services-workspace">
    {status && <p className="form-alert success-alert">{status}</p>}
    <div className="services-heading"><div><h2>Manage your packages</h2><p>Create clear, complete offers that customers can compare easily.</p></div><span className="services-count">{services.length} package{services.length === 1 ? '' : 's'}</span></div>
    <div className="services-layout">
      <form className="profile-form service-form" onSubmit={create}>
        <div className="service-form-heading"><div><p className="eyebrow">{editingId ? 'Edit package' : 'New package'}</p><h3>{editingId ? 'Update service package' : 'Add service package'}</h3></div>{editingId && <button className="service-cancel" onClick={() => { setEditingId(null); setForm(initialForm); setImages([]); }} type="button">Cancel</button>}</div>
        <fieldset><legend>Package details</legend><div className="service-fields">{fields.slice(0, 2).map(([name, label]) => <label key={name}>{label}{name === 'event_type' ? <select name={name} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required><option value="">Select event type</option>{EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select> : <input name={name} type="text" value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required />}</label>)}</div></fieldset>
        <fieldset><legend>Capacity and pricing</legend><div className="service-fields service-fields-three">{fields.slice(2).map(([name, label]) => <label key={name}>{label}<input name={name} type={name === 'price' ? 'number' : 'text'} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required /></label>)}</div></fieldset>
        <fieldset><legend>Package presentation</legend><div className="service-fields"><label>Package description<textarea name="description" value={form.description} onChange={(event) => setForm({ ...form, [event.target.name]: event.target.value })} placeholder="Describe the service, setup, styling, or event experience." /></label><label>What's included in this package?<textarea name="features" value={form.features} onChange={(event) => setForm({ ...form, [event.target.name]: event.target.value })} placeholder="List the setup, equipment, staff, styling, or other inclusions." /></label></div><div className="service-upload"><span className="service-upload-label">Package photos</span><div className="service-upload-control"><label className="service-file-button" htmlFor="service-images" title="Add package photos" aria-label="Add package photos">+</label><input id="service-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages(Array.from(event.target.files || []))} /><span>{images.length ? `${images.length} photo${images.length === 1 ? '' : 's'} selected` : 'Add photos of your setup or service'}</span></div><small>Show customers the setup, styling, equipment, or service experience.</small></div></fieldset>
        <button className="button button-primary service-submit" type="submit">{editingId ? 'Update service' : 'Create service'} <span>↗</span></button>
      </form>
      <section className="services-catalog"><div className="catalog-heading"><div><p className="eyebrow">Your catalog</p><h3>Created packages</h3></div><span>Manage availability and details</span></div>{services.length === 0 ? <p className="service-empty">No packages yet. Your created packages will appear here.</p> : <div className="service-list">{services.map((service) => { const imagePaths = service.image_paths ? service.image_paths.split('||') : []; const reviewComments = service.review_comments ? service.review_comments.split('||').slice(0, 3) : []; return <article className="package-card service-card" key={service.id}>{imagePaths.length > 0 ? <div className="service-card-gallery">{imagePaths.slice(0, 4).map((path) => <img key={path} src={imageUrl(path)} alt={`${service.package_name} sample`} />)}</div> : <div className="service-card-gallery service-card-gallery-empty"><span>✦</span><small>Add package photos to showcase this offer</small></div>}<div className="service-card-top"><div><span className="service-type">{service.event_type}</span><h3>{service.package_name}</h3></div><strong>₱{Number(service.price).toLocaleString()}</strong></div><div className="service-card-meta"><span><b>{service.guest_count_min}-{service.guest_count_max}</b> guests</span><span><b>{service.max_bookings > 0 ? `${service.booking_count}/${service.max_bookings}` : 'Unlimited'}</b> bookings</span><span className="service-card-rating"><b>★ {Number(service.rating || 0) > 0 ? Number(service.rating).toFixed(1) : 'New'}</b> {service.review_count || 0} review{Number(service.review_count || 0) === 1 ? '' : 's'}</span></div>{service.description && <p className="service-description">{service.description}</p>}<div className="service-review-comments"><span className="service-review-title">Customer comments</span>{reviewComments.length > 0 ? reviewComments.map((comment, index) => <p key={`${service.id}-review-${index}`}>“{comment}”</p>) : <p className="service-review-empty">No customer comments yet.</p>}</div>{service.max_bookings > 0 && Number(service.booking_count) >= Number(service.max_bookings) && <strong className="package-full-label">Package full</strong>}<div className="service-actions"><button className="button service-edit" onClick={() => edit(service)} type="button">Edit package</button><button className="button service-delete" onClick={() => remove(service.id)} type="button">Delete</button></div></article>; })}</div>}</section>
    </div>
  </div></DashboardPage>;
}
