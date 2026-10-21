import { useEffect, useState } from 'react';
import { House, Mail, MapPin, Phone, ShieldCheck, Upload } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function CatererProfile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploadingGcashQr, setUploadingGcashQr] = useState(false);
  const [permitPreviewUrl, setPermitPreviewUrl] = useState('');
  const [permitPreviewError, setPermitPreviewError] = useState('');

  async function load() {
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.');

      const { data: me, error: meError } = await supabase.rpc('get_my_profile');
      if (meError) throw meError;

      const currentProfile = me?.[0];
      if (!currentProfile?.user_id) throw new Error('Caterer profile not found.');

      const { data, error } = await supabase
        .from('caterers')
        .select('*')
        .eq('user_id', currentProfile.user_id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data || null);
      setPermitPreviewUrl('');
      setPermitPreviewError('');
      if (data?.business_permit) {
        const { data: permitFile, error: permitError } = await supabase.storage
          .from('permits')
          .createSignedUrl(data.business_permit, 3600);
        if (permitError) {
          setPermitPreviewError(`Could not display the uploaded permit: ${permitError.message}`);
        } else {
          setPermitPreviewUrl(permitFile.signedUrl);
        }
      }
      setError('');
    } catch (reason) {
      setProfile(null);
      setError(reason.message || 'Failed to load profile.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function update(event) {
    event.preventDefault();
    setStatus('');
    setError('');

    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.');

      const form = new FormData(event.currentTarget);
      const payload = {
        business_name: String(form.get('business_name') || '').trim(),
        phone: String(form.get('phone') || '').trim(),
        address: String(form.get('address') || '').trim(),
        city: String(form.get('city') || '').trim(),
        description: String(form.get('description') || '').trim(),
        paypal_email: String(form.get('paypal_email') || '').trim(),
      };

      if (!payload.business_name || !payload.phone || !payload.address || !payload.city) {
        throw new Error('Business name, phone, address, and city are required.');
      }
      if (!profile.business_permit) {
        throw new Error('Upload your business permit before saving your profile.');
      }

      const { data: me, error: meError } = await supabase.rpc('get_my_profile');
      if (meError) throw meError;

      const currentProfile = me?.[0];
      if (!currentProfile?.user_id) throw new Error('Caterer profile not found.');

      const { error } = await supabase
        .from('caterers')
        .update(payload)
        .eq('user_id', currentProfile.user_id);

      if (error) throw error;

      setStatus('Profile updated successfully.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Profile update failed.');
    }
  }

  async function uploadProfileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('');
    setError('');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Profile photo must be JPG, PNG, or WEBP.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must not exceed 5MB.');
      event.target.value = '';
      return;
    }

    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.');

      const { data: me, error: meError } = await supabase.rpc('get_my_profile');
      if (meError) throw meError;

      const currentProfile = me?.[0];
      if (!currentProfile?.caterer_id) throw new Error('Caterer profile not found.');

      const path = `${currentProfile.caterer_id}/profile-${crypto.randomUUID()}.${file.type.split('/')[1]}`;
      const { error: uploadError } = await supabase.storage.from('package-images').upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(`Photo storage upload failed: ${uploadError.message}`);

      const { data: publicImage } = supabase.storage.from('package-images').getPublicUrl(path);
      const { error: updateError } = await supabase.from('caterers').update({ profile_image: publicImage.publicUrl }).eq('user_id', currentProfile.user_id);
      if (updateError) throw new Error(`Photo uploaded, but saving it to the caterer profile failed: ${updateError.message}`);

      window.dispatchEvent(new CustomEvent('caterer-profile-image-updated', { detail: publicImage.publicUrl }));
      setStatus('Profile photo updated.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Profile photo upload failed.');
    }

    event.target.value = '';
  }

  async function uploadPermit(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(''); setError('');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setError('Business permit must be PDF, JPG, or PNG.'); event.target.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Business permit must not exceed 10MB.'); event.target.value = ''; return;
    }
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Please sign in again before uploading the permit.');
      const path = `${authData.user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('permits').upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: permitError } = await supabase.rpc('save_my_caterer_permit', { permit_path: path });
      if (permitError) throw permitError;
      setStatus('Business permit uploaded.');
      await load();
    } catch (reason) { setError(reason.message || 'Business permit upload failed.'); }
    event.target.value = '';
  }

  async function uploadGcashQr(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('');
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('GCash QR code must be JPG, PNG, or WEBP.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('GCash QR code must not exceed 5MB.');
      event.target.value = '';
      return;
    }

    setUploadingGcashQr(true);
    let uploadedPath = '';
    try {
      const { data: me, error: meError } = await supabase.rpc('get_my_profile');
      if (meError) throw meError;
      const currentProfile = me?.[0];
      if (!currentProfile?.user_id || !currentProfile?.caterer_id) throw new Error('Caterer profile not found.');

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before uploading your GCash QR code.');

      const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
      uploadedPath = `${authData.user.id}/${currentProfile.caterer_id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('caterer-gcash-qr')
        .upload(uploadedPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from('caterer-gcash-qr').getPublicUrl(uploadedPath);
      const { error: updateError } = await supabase
        .from('caterers')
        .update({ gcash_qr_code: publicUrl.publicUrl })
        .eq('id', currentProfile.caterer_id);
      if (updateError) throw new Error(`QR uploaded, but the caterer profile could not be updated: ${updateError.message}`);

      setStatus('GCash QR code saved. Customers can now submit GCash payments.');
      await load();
    } catch (reason) {
      setError(reason.message || 'GCash QR upload failed.');
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('caterer-gcash-qr').remove([uploadedPath]);
        if (cleanupError) console.error('Could not remove an unsaved GCash QR code:', cleanupError);
      }
    } finally {
      setUploadingGcashQr(false);
      event.target.value = '';
    }
  }

  if (!profile) return <DashboardPage role="caterer" section="profile">{error ? <p>{error}</p> : <LoadingSpinner />}</DashboardPage>;

  return (
    <DashboardPage role="caterer" section="profile">
      <div className="caterer-profile-page">
        {status && <p className="form-alert success-alert">{status}</p>}
        {error && <p className="form-alert error-alert">{error}</p>}

        <section className="caterer-profile-photo-card">
          <div className="caterer-profile-avatar">
            {profile.profile_image
              ? <img src={profile.profile_image} alt="Caterer profile" />
              : <span>{profile.business_name?.charAt(0)?.toUpperCase() || 'C'}</span>}
          </div>
          <div className="caterer-profile-photo-copy">
            <p className="caterer-profile-approved"><ShieldCheck size={14} aria-hidden="true" /> Approved caterer profile</p>
            <h2>{profile.business_name || 'Your business'}</h2>
            <p>Upload a clear photo or logo customers can recognize.</p>
            <small className="caterer-profile-photo-hint">JPG, PNG, or WEBP · maximum 5MB</small>
          </div>
          <label className="button button-secondary caterer-profile-upload">
            <Upload size={16} aria-hidden="true" />
            Upload photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadProfileImage} />
          </label>
        </section>

        <form className="profile-form caterer-profile-details" onSubmit={update}>
          <h3>Business details</h3>
          <div className="caterer-profile-fields">
            <label>
              <span>Business name</span>
              <span className="caterer-profile-input-wrap"><House size={16} aria-hidden="true" /><input name="business_name" defaultValue={profile.business_name} required /></span>
            </label>
            <label>
              <span>Phone</span>
              <span className="caterer-profile-input-wrap"><Phone size={16} aria-hidden="true" /><input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10,15}" maxLength="15" defaultValue={profile.phone || ''} onChange={(event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 15); }} required /></span>
            </label>
            <label className="caterer-profile-address">
              <span>Address</span>
              <span className="caterer-profile-input-wrap"><House size={16} aria-hidden="true" /><input name="address" placeholder="Street, barangay" defaultValue={profile.address || ''} required /></span>
            </label>
            <label className="caterer-profile-city">
              <span>City</span>
              <span className="caterer-profile-input-wrap"><MapPin size={16} aria-hidden="true" /><input name="city" placeholder="e.g. Dasmariñas" defaultValue={profile.city || ''} required /></span>
            </label>
            <label className="caterer-profile-paypal">
              <span>PayPal email</span>
              <span className="caterer-profile-input-wrap"><Mail size={16} aria-hidden="true" /><input name="paypal_email" type="email" placeholder="you@example.com" defaultValue={profile.paypal_email || ''} required /></span>
              <small>Requested payouts for your bookings are sent to this PayPal account.</small>
            </label>
          </div>
          <input type="hidden" name="description" value={profile.description || ''} readOnly />
          <div className="caterer-profile-actions">
            <button className="button button-secondary" type="button" onClick={(event) => event.currentTarget.form?.reset()}>Cancel</button>
            <button className="button button-primary" type="submit">Save changes</button>
          </div>
        </form>

        <section className="caterer-gcash-qr-card">
          <div>
            <h3>GCash payment QR code</h3>
            <p>Customers can scan your QR code to pay the down payment or remaining balance. You must review their uploaded receipt before a payment is confirmed.</p>
            <small>JPG, PNG, or WEBP · maximum 5MB</small>
          </div>
          {profile.gcash_qr_code && (
            <a className="caterer-gcash-qr-preview-link" href={profile.gcash_qr_code} target="_blank" rel="noreferrer" aria-label="Open your saved GCash QR code">
              <img src={profile.gcash_qr_code} alt="Your saved GCash QR code" className="caterer-gcash-qr-preview" />
            </a>
          )}
          <label className="button button-secondary caterer-permit-upload">
            <Upload size={16} aria-hidden="true" />
            {uploadingGcashQr ? 'Uploading…' : profile.gcash_qr_code ? 'Replace GCash QR' : 'Upload GCash QR'}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingGcashQr} onChange={uploadGcashQr} />
          </label>
        </section>

        <section className="caterer-permit-card">
          <div>
            <h3>Business permit</h3>
            <p>{profile.business_permit ? 'Permit uploaded. Upload a new file to replace it.' : 'Upload a permit to complete your business profile.'}</p>
            <small>PDF, JPG, or PNG · maximum 10MB</small>
          </div>
          {profile.business_permit && permitPreviewError && <p className="form-alert error-alert" role="alert">{permitPreviewError}</p>}
          {profile.business_permit && permitPreviewUrl && (
            <div className="caterer-permit-preview">
              {/\.pdf(?:$|[?#])/i.test(profile.business_permit) ? (
                <iframe title="Uploaded business permit PDF" src={permitPreviewUrl} />
              ) : (
                <a href={permitPreviewUrl} target="_blank" rel="noreferrer" aria-label="Open your uploaded business permit">
                  <img src={permitPreviewUrl} alt="Your uploaded business permit" />
                </a>
              )}
            </div>
          )}
          <label className="button button-secondary caterer-permit-upload">
            <Upload size={16} aria-hidden="true" />
            {profile.business_permit ? 'Replace permit' : 'Upload permit'}
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={uploadPermit} />
          </label>
        </section>
      </div>
    </DashboardPage>
  );
}
