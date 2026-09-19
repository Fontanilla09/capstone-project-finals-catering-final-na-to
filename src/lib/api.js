export const API_BASE = '';

export async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(response.ok ? 'The server returned an invalid response.' : `Server error (${response.status}). Please try again.`);
  }
  if (response.status === 401) {
    throw new Error('Your session has expired. Please log in again.');
  }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
