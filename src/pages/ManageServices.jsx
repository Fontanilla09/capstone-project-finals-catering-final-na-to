import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, LoaderCircle, Search } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { EVENT_TYPES } from '../lib/eventTypes';
import DashboardPage from '../components/DashboardPage.jsx';

const initialForm = { package_name: '', event_type: '', price: '', description: '', features: '' };

function imageUrl(path) {
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
}

export default function ManageServices() {
  const [services, setServices] = useState([]); const [form, setForm] = useState(initialForm); const [images, setImages] = useState([]); const [editingId, setEditingId] = useState(null); const [expandedServiceId, setExpandedServiceId] = useState(null); const [searchTerm, setSearchTerm] = useState(''); const [currentPage, setCurrentPage] = useState(1); const [pageSize, setPageSize] = useState(5); const [showForm, setShowForm] = useState(false); const [status, setStatus] = useState(''); const [formError, setFormError] = useState(''); const [saving, setSaving] = useState(false);
  async function getCatererId() {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error || !data?.[0]?.caterer_id) throw new Error('Caterer profile not found.');
    return data[0].caterer_id;
  }

  async function load() {
    try {
      const catererId = await getCatererId();
      const { data, error } = await supabase.from('packages').select('id, package_name, event_type, price, description, includes, package_images(image_path)').eq('caterer_id', catererId).order('id', { ascending: false });
      if (error) throw error;
      setServices((data || []).map((service) => ({ ...service, image_paths: (service.package_images || []).map((image) => image.image_path).join('||'), booking_count: 0, rating: 0, review_count: 0, review_comments: '' })));
    } catch (error) { setStatus(error.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!showForm) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [showForm]);
  function closeForm() {
    if (saving) return;
    setEditingId(null);
    setForm(initialForm);
    setImages([]);
    setFormError('');
    setShowForm(false);
  }
  async function create(event) {
    event.preventDefault();
    if (saving) return;
    const wasEditing = Boolean(editingId);
    setFormError('');
    setSaving(true);
    try {
      const catererId = await getCatererId();
      const payload = { package_name: form.package_name.trim(), event_type: form.event_type.trim(), price: Number(form.price), description: form.description.trim(), includes: form.features.trim(), caterer_id: catererId };
      if (!payload.package_name || !payload.event_type || payload.price <= 0) throw new Error('Complete the service fields with a valid price.');
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
      setForm(initialForm); setImages([]); setEditingId(null); setShowForm(false); setStatus(wasEditing ? 'Service updated.' : 'Service created.'); load();
    } catch (error) { setFormError(error.message); }
    finally { setSaving(false); }
  }
  async function remove(id) { try { const catererId = await getCatererId(); const { error } = await supabase.from('packages').delete().eq('id', id).eq('caterer_id', catererId); if (error) throw error; setExpandedServiceId(null); setCurrentPage(1); setStatus('Service deleted.'); load(); } catch (error) { setStatus(error.message); } }
  function edit(service) { setEditingId(service.id); setShowForm(true); setImages([]); setForm({ package_name: service.package_name, event_type: service.event_type, price: service.price, description: service.description || '', features: service.includes || '' }); }
  const filteredServices = services.filter((service) => `${service.id} ${service.package_name} ${service.event_type}`.toLowerCase().includes(searchTerm.trim().toLowerCase()));
  const pageCount = Math.ceil(filteredServices.length / pageSize);
  const pagedServices = filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisibleService = filteredServices.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisibleService = Math.min(currentPage * pageSize, filteredServices.length);
  const fields = [['package_name', 'Package name'], ['event_type', 'Event type'], ['price', 'Price']];
  return <DashboardPage role="caterer" section="services"><div className="services-workspace">
    {status && <p className="form-alert success-alert">{status}</p>}
    <div className="services-heading"><div><p className="eyebrow">Services</p><h2>Manage your packages</h2><p>Create clear, complete offers that customers can compare easily.</p></div><div className="services-heading-actions"><button className="button button-primary" onClick={() => { setEditingId(null); setForm(initialForm); setImages([]); setShowForm(true); }} type="button">Add package <span aria-hidden="true">+</span></button></div></div>
    <div className="services-layout services-layout-catalog">
      {showForm && createPortal(
      <div className="service-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) closeForm(); }}>
      <section className="service-modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
      <form className="profile-form service-form" onSubmit={create}>
        <div className="service-form-heading"><div><p className="eyebrow">{editingId ? 'Edit package' : 'New package'}</p><h3 id="service-modal-title">{editingId ? 'Update service package' : 'Add service package'}</h3></div><button className="service-modal-close" aria-label="Close package form" disabled={saving} onClick={closeForm} type="button">&times;</button></div>
        {formError && <p className="form-alert error-alert" role="alert">{formError}</p>}
        <fieldset><legend>Package details</legend><div className="service-fields">{fields.slice(0, 2).map(([name, label]) => <label key={name}>{label}{name === 'event_type' ? <select name={name} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required><option value="">Select event type</option>{EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select> : <input autoFocus={name === 'package_name'} name={name} type="text" value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required />}</label>)}</div></fieldset>
        <fieldset><legend>Pricing</legend><div className="service-fields">{fields.slice(2).map(([name, label]) => <label key={name}>{label}<input name={name} type="number" min="0.01" step="0.01" value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} required /></label>)}</div></fieldset>
        <fieldset><legend>Package presentation</legend><div className="service-fields"><label>Package description<textarea name="description" value={form.description} onChange={(event) => setForm({ ...form, [event.target.name]: event.target.value })} placeholder="Describe the service, setup, styling, or event experience." /></label><label>What's included in this package?<textarea name="features" value={form.features} onChange={(event) => setForm({ ...form, [event.target.name]: event.target.value })} placeholder="List the setup, equipment, staff, styling, or other inclusions." /></label></div><div className="service-upload"><span className="service-upload-label">Package photos</span><div className="service-upload-control"><label className="service-file-button" htmlFor="service-images" title="Add package photos" aria-label="Add package photos">+</label><input id="service-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages(Array.from(event.target.files || []))} /><span>{images.length ? `${images.length} photo${images.length === 1 ? '' : 's'} selected` : 'Add photos of your setup or service'}</span></div><small>Show customers the setup, styling, equipment, or service experience.</small></div></fieldset>
        <div className="service-modal-actions"><button className="service-cancel" disabled={saving} onClick={closeForm} type="button">Cancel</button><button className="button button-primary service-submit" disabled={saving} type="submit" aria-busy={saving}>{saving ? <><LoaderCircle className="gcash-payment-spinner" size={16} aria-hidden="true" /> {editingId ? 'Updating service…' : 'Creating package…'}</> : <>{editingId ? 'Update service' : 'Create package'} <span>↗</span></>}</button></div>
      </form>
      </section>
      </div>,
      document.body
      )}
      <section className="services-catalog">
        <div className="catalog-heading">
          <div><p className="eyebrow">Your catalog</p><h3>Your packages</h3></div>
          <span>{services.length} package{services.length === 1 ? '' : 's'}</span>
        </div>
        {services.length === 0 ? (
          <div className="service-empty">
            <span className="service-empty-mark" aria-hidden="true">+</span>
            <h4>No packages yet</h4>
            <p>Create your first package so customers can discover what you offer.</p>
            <button className="button button-primary" onClick={() => { setEditingId(null); setForm(initialForm); setImages([]); setShowForm(true); }} type="button">Create your first package</button>
          </div>
        ) : (
          <>
          <div className="service-catalog-tools">
            <p>Review your offers and keep package details up to date.</p>
            <label className="service-search">
              <Search size={16} aria-hidden="true" />
              <input aria-label="Search packages" onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); setExpandedServiceId(null); }} placeholder="Search packages" type="search" value={searchTerm} />
            </label>
          </div>
          <div className="service-list">
            {pagedServices.length ? pagedServices.map((service) => {
              const imagePaths = service.image_paths ? service.image_paths.split('||') : [];
              const isExpanded = expandedServiceId === service.id;
              const detailsId = `service-details-${service.id}`;
              return (
                <article className={`service-package-card${isExpanded ? ' is-expanded' : ''}`} key={service.id}>
                  <div className="service-package-card-main">
                    <div className="service-package-card-title">
                      {imagePaths.length > 0
                        ? <img className="service-package-thumb" src={imageUrl(imagePaths[0])} alt="" />
                        : <span className="service-package-thumb service-package-monogram" aria-hidden="true">{service.package_name.slice(0, 1).toUpperCase()}</span>}
                      <div className="service-package-title-copy">
                        <div className="service-package-kicker"><span>Package #{service.id}</span><span className="service-event-chip">{service.event_type}</span></div>
                        <h4>{service.package_name}</h4>
                      </div>
                    </div>
                    <div className="service-package-price"><span>Starting at</span><strong>₱{Number(service.price).toLocaleString()}</strong></div>
                  </div>
                  <div className="service-package-card-bottom">
                    <button
                      className="service-details-toggle"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}
                      type="button"
                    >
                      {isExpanded ? 'Hide details' : 'View details'}
                      {isExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="service-package-details" id={detailsId}>
                      <div className="service-detail-copy">
                        <div><h5>Description</h5><p>{service.description || 'No description provided.'}</p></div>
                        <div><h5>What's included</h5><p>{service.includes || 'No inclusions listed.'}</p></div>
                      </div>
                      {imagePaths.length > 0 && (
                        <div className="service-package-photos" aria-label="Package photos">
                          {imagePaths.slice(0, 4).map((path) => (
                            <img key={path} src={imageUrl(path)} alt={`${service.package_name} sample`} />
                          ))}
                        </div>
                      )}
                      <div className="service-actions">
                        <button className="button service-edit" onClick={() => edit(service)} type="button">Edit package</button>
                        <button className="button service-delete" onClick={() => remove(service.id)} type="button">Delete package</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            }) : (
              <p className="service-search-empty">{searchTerm ? `No packages match “${searchTerm}”.` : 'No packages found.'}</p>
            )}
          </div>
          <div className="table-wrap service-table-wrap">
            <table className="customer-table service-table">
              <thead>
                <tr><th>Package</th><th>Event type</th><th>Price</th><th aria-label="Actions"></th></tr>
              </thead>
              <tbody>
                {pagedServices.length ? pagedServices.map((service) => {
                  const imagePaths = service.image_paths ? service.image_paths.split('||') : [];
                  const isExpanded = expandedServiceId === service.id;
                  return (
                    <Fragment key={service.id}>
                      <tr className={isExpanded ? 'service-package-row expanded' : 'service-package-row'}>
                        <td data-label="Package">
                          <div className="service-package-cell">
                            <span className="service-package-id">#{service.id}</span>
                            <button className="service-package-name" aria-expanded={isExpanded} onClick={() => setExpandedServiceId(isExpanded ? null : service.id)} type="button">{service.package_name}</button>
                          </div>
                        </td>
                        <td data-label="Event type"><span className="service-event-chip">{service.event_type}</span></td>
                        <td data-label="Price"><strong className="service-price">₱{Number(service.price).toLocaleString()}</strong></td>
                        <td data-label="Details">
                          <button
                            className="service-table-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}
                            type="button"
                          >
                            {isExpanded ? <>Hide <ChevronUp size={15} aria-hidden="true" /></> : <>Details <ChevronDown size={15} aria-hidden="true" /></>}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="service-table-detail-row">
                          <td colSpan="4">
                            <div className="service-table-details">
                              <div className="service-table-detail-copy">
                                <p><strong>Description</strong><br />{service.description || 'No description provided.'}</p>
                                <p><strong>What's included</strong><br />{service.includes || 'No inclusions listed.'}</p>
                              </div>
                              {imagePaths.length > 0 && (
                                <div className="service-table-photos">
                                  {imagePaths.slice(0, 4).map((path) => (
                                    <img key={path} src={imageUrl(path)} alt={`${service.package_name} sample`} />
                                  ))}
                                </div>
                              )}
                              <div className="service-actions">
                                <button className="button service-edit" onClick={() => edit(service)} type="button">Edit package</button>
                                <button className="button service-delete" onClick={() => remove(service.id)} type="button">Delete package</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }) : (
                  <tr className="service-table-empty"><td colSpan="4">{searchTerm ? `No packages match “${searchTerm}”.` : 'No packages found.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredServices.length > 0 && (
            <div className="service-pagination" aria-label="Package table pagination">
              <div className="service-pagination-info">
                <label htmlFor="service-page-size">Cards per page</label>
                <select
                  id="service-page-size"
                  onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); setExpandedServiceId(null); }}
                  value={pageSize}
                >
                  {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <span>{firstVisibleService}–{lastVisibleService} of {filteredServices.length}</span>
              </div>
              {pageCount > 1 && (
                <nav className="service-pagination-controls" aria-label="Package pages">
                  <button aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setCurrentPage(currentPage - 1); setExpandedServiceId(null); }} type="button">Previous</button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                    <button
                      aria-current={currentPage === page ? 'page' : undefined}
                      aria-label={`Page ${page}`}
                      className={currentPage === page ? 'active' : ''}
                      key={page}
                      onClick={() => { setCurrentPage(page); setExpandedServiceId(null); }}
                      type="button"
                    >
                      {page}
                    </button>
                  ))}
                  <button aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setCurrentPage(currentPage + 1); setExpandedServiceId(null); }} type="button">Next</button>
                </nav>
              )}
            </div>
          )}
          </>
        )}
      </section>
    </div>
  </div></DashboardPage>;
}
