import { supabase } from './supabase';

export async function getUnavailableCatererIds() {
  const { data, error } = await supabase.rpc('get_unavailable_caterer_ids');
  if (error) throw error;
  return new Set((data || []).map(({ caterer_id }) => String(caterer_id)));
}
