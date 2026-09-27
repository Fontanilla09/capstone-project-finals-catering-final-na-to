import { supabase } from './supabase';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function requestJson(path, options = {}) {
  const { data: { session } = {} } = supabase ? await supabase.auth.getSession() : { data: {} };
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });

  const body = await response.text();

  if (response.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Your session has expired. Please log in again.');
  }

  if (!body) {
    if (response.ok) {
      throw new Error('The server returned an empty response.');
    }
    throw new Error(`Server error (${response.status}). Please try again.`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(response.ok ? 'The server returned an invalid response.' : `Server error (${response.status}). Please try again.`);
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}
