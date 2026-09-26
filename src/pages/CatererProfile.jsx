import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

export default function CatererProfile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

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
      if (!currentProfile?.user_id) throw new Error('Caterer profile not found.');

      const path = `${currentProfile.user_id}/profile-${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('package-images').upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicImage } = supabase.storage.from('package-images').getPublicUrl(path);
      const { error: updateError } = await supabase.from('caterers').update({ profile_image: publicImage.publicUrl }).eq('user_id', currentProfile.user_id);
      if (updateError) throw updateError;

      setStatus('Profile photo updated.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Profile photo upload failed.');
    }

    event.target.value = '';
  }

  if (!profile) return <DashboardPage role="caterer" section="profile"><p>{error || 'Loading profile...'}</p></DashboardPage>;

  return <DashboardPage role="caterer" section="profile"><>{status && <p className="form-alert success-alert">{status}</p>}{error && <p className="form-alert error-alert">{error}</p>}<section className="profile-photo-panel"><div className="profile-photo-preview">{profile.profile_image ? <img src={profile.profile_image} alt="Caterer profile" /> : <span>{profile.business_name?.charAt(0)?.toUpperCase() || 'C'}</span>}</div><div><p className="eyebrow">Approved caterer profile</p><h2>Profile photo</h2><p>Upload a clear photo or logo customers can recognize.</p><label className="button button-secondary profile-photo-upload">+ Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadProfileImage} /></label><small>JPG, PNG, or WEBP · maximum 5MB</small></div></section><form className="profile-form" onSubmit={update}><label>Business name<input name="business_name" defaultValue={profile.business_name} required /></label><label>Phone<input name="phone" type="tel" inputMode="numeric" pattern="[0-9]{10,15}" maxLength="15" defaultValue={profile.phone || ''} onChange={(event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 15); }} required /></label><label>Address<input name="address" defaultValue={profile.address || ''} required /></label><label>City<input name="city" defaultValue={profile.city || ''} required /></label><label>Description<textarea name="description" defaultValue={profile.description || ''} /></label><label>PayPal email<input name="paypal_email" type="email" defaultValue={profile.paypal_email || ''} /></label><button className="button button-primary" type="submit">Save profile</button></form></></DashboardPage>;
}
