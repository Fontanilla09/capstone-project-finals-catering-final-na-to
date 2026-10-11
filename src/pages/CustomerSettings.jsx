import { useEffect, useState } from 'react';
import { requestJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import DashboardPage from '../components/DashboardPage.jsx';

export default function CustomerSettings() {
  const [profile, setProfile] = useState({ fullName: '', phone: '', email: '' });
  const [emailToUpdate, setEmailToUpdate] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [status, setStatus] = useState({ error: '', success: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const [{ data: userData, error: userError }, { data: profileRows, error: profileError }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc('get_my_profile'),
        ]);
        if (userError) throw userError;
        if (profileError) throw profileError;
        const currentProfile = profileRows?.[0];
        if (!userData.user || currentProfile?.role !== 'customer' || !currentProfile.customer_id) {
          throw new Error('Customer account required.');
        }

        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('full_name, phone')
          .eq('id', currentProfile.customer_id)
          .single();
        if (customerError) throw customerError;
        if (!active) return;
        setProfile({
          fullName: customer.full_name || '',
          phone: customer.phone || '',
          email: userData.user.email || '',
        });
        setEmailToUpdate(userData.user.email || '');
      } catch (error) {
        if (active) setStatus({ error: error.message, success: '' });
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();
    return () => { active = false; };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    setSavingProfile(true);
    try {
      const { error } = await supabase.rpc('update_my_customer_settings', {
        p_full_name: profile.fullName.trim(),
        p_phone: profile.phone.trim(),
      });
      if (error) throw error;
      setStatus({ error: '', success: 'Personal information updated.' });
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateEmail(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    setUpdatingEmail(true);
    try {
      const nextEmail = emailToUpdate.trim().toLowerCase();
      if (!nextEmail || nextEmail === profile.email.toLowerCase()) {
        throw new Error('Enter a different email address.');
      }
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setStatus({
        error: '',
        success: 'Check your new email inbox and confirm the address to finish updating it.',
      });
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setUpdatingEmail(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    if (newPassword.length < 8) {
      setStatus({ error: 'Use at least 8 characters for your new password.', success: '' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus({ error: 'The new passwords do not match.', success: '' });
      return;
    }

    setChangingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect.');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setStatus({ error: '', success: 'Password updated successfully.' });
    } catch (error) {
      setStatus({ error: error.message, success: '' });
    } finally {
      setChangingPassword(false);
    }
  }

  async function signOutAllDevices() {
    if (!window.confirm('Sign out this account from all devices? You will need to sign in again.')) return;
    setSigningOutEverywhere(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      window.location.replace('/login');
    } catch (error) {
      setStatus({ error: error.message, success: '' });
      setSigningOutEverywhere(false);
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setStatus({ error: '', success: '' });
    if (deleteConfirmation !== 'DELETE') {
      setStatus({ error: 'Type DELETE exactly to confirm account deletion.', success: '' });
      return;
    }

    setDeletingAccount(true);
    try {
      await requestJson('/backend/delete_account_api.php', {
        method: 'POST',
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      await supabase.auth.signOut({ scope: 'local' });
      window.location.replace('/login?account=deleted');
    } catch (error) {
      setStatus({ error: error.message, success: '' });
      setDeletingAccount(false);
    }
  }

  return (
    <DashboardPage role="customer" section="settings">
      <div className="customer-settings-page">
        <header className="customer-settings-heading">
          <p className="eyebrow">Account preferences</p>
          <h2>Settings</h2>
          <p>Manage your personal information and keep your account secure.</p>
        </header>

        {status.error && <p className="form-alert error-alert" role="alert">{status.error}</p>}
        {status.success && <p className="form-alert success-alert" role="status">{status.success}</p>}
        {loading ? <p className="muted-label">Loading account settings...</p> : (
          <>
            <section className="customer-settings-card">
              <div className="customer-settings-card-heading">
                <h3>Personal information</h3>
                <p>Update the name and phone number used for your bookings.</p>
              </div>
              <form className="customer-settings-form" onSubmit={saveProfile}>
                <label htmlFor="settings-full-name">Full name</label>
                <input id="settings-full-name" autoComplete="name" maxLength={100} required value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} />
                <label htmlFor="settings-phone">Phone number</label>
                <input id="settings-phone" autoComplete="tel" maxLength={15} required value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
                <button className="button button-primary" disabled={savingProfile} type="submit">{savingProfile ? 'Saving...' : 'Save changes'}</button>
              </form>
            </section>

            <section className="customer-settings-card">
              <div className="customer-settings-card-heading">
                <h3>Email address</h3>
                <p>We’ll ask you to confirm a new email address before it takes effect.</p>
              </div>
              <form className="customer-settings-form" onSubmit={updateEmail}>
                <label htmlFor="settings-current-email">Current email</label>
                <input id="settings-current-email" readOnly value={profile.email} />
                <label htmlFor="settings-new-email">New email</label>
                <input id="settings-new-email" autoComplete="email" type="email" required value={emailToUpdate} onChange={(event) => setEmailToUpdate(event.target.value)} />
                <button className="button button-secondary" disabled={updatingEmail} type="submit">{updatingEmail ? 'Sending confirmation...' : 'Update email'}</button>
              </form>
            </section>

            <section className="customer-settings-card">
              <div className="customer-settings-card-heading">
                <h3>Change password</h3>
                <p>Verify your current password before choosing a new one.</p>
              </div>
              <form className="customer-settings-form" onSubmit={changePassword}>
                <label htmlFor="settings-current-password">Current password</label>
                <input id="settings-current-password" autoComplete="current-password" required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                <label htmlFor="settings-new-password">New password</label>
                <input id="settings-new-password" autoComplete="new-password" minLength={8} required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                <label htmlFor="settings-confirm-password">Confirm new password</label>
                <input id="settings-confirm-password" autoComplete="new-password" minLength={8} required type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
                <button className="button button-primary" disabled={changingPassword} type="submit">{changingPassword ? 'Updating...' : 'Change password'}</button>
              </form>
            </section>

            <section className="customer-settings-card">
              <div className="customer-settings-card-heading">
                <h3>Account security</h3>
                <p>Sign out of every device or permanently delete your account.</p>
              </div>
              <div className="customer-settings-actions">
                <button className="button button-secondary" disabled={signingOutEverywhere} onClick={signOutAllDevices} type="button">
                  {signingOutEverywhere ? 'Signing out...' : 'Sign out all devices'}
                </button>
              </div>
              <form className="customer-settings-delete" onSubmit={deleteAccount}>
                <strong>Delete account permanently</strong>
                <p>This permanently removes your account and associated customer data. This action cannot be undone.</p>
                <label htmlFor="settings-delete-confirmation">Type DELETE to confirm</label>
                <input id="settings-delete-confirmation" autoComplete="off" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                <button className="button customer-settings-delete-button" disabled={deletingAccount} type="submit">
                  {deletingAccount ? 'Deleting account...' : 'Delete my account'}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </DashboardPage>
  );
}
