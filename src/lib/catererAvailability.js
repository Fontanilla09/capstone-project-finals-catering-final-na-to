import { isSupabaseConfigured, supabase } from './supabase';

export async function isCatererAvailableOnDate(catererId, eventDate) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Booking availability is unavailable because Supabase is not configured.');
  }

  const { data, error } = await supabase.rpc('is_caterer_available_on_date', {
    p_caterer_id: catererId,
    p_event_date: eventDate,
  });
  if (error) throw error;
  return data === true;
}
