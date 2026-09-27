import { API_BASE } from './api';
import { supabase } from './supabase';

const pollIntervalMs = 3000;
const maxPollAttempts = 180;

async function postImageRequest(path, body, accessToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      } catch {
        data = null;
      }
    }
    if (!data) {
      const contentType = response.headers.get('content-type') || 'unknown content type';
      throw new Error(`Image service returned an invalid response (HTTP ${response.status}, ${contentType}). Check the PHP server output.`);
    }
  }
  if (!response.ok || !data.success) throw new Error(data.error || 'Image generation failed.');
  return data;
}

export async function generateImage({ image, prompt, aspectRatio = '1:1', onStatus = () => {} }) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again before generating an image.');

  const form = new FormData();
  if (image) form.append('image', image);
  form.append('prompt', prompt);
  form.append('aspect_ratio', aspectRatio);
  const task = await postImageRequest('/backend/generate.php', form, accessToken);
  if (!task.task_token) throw new Error('The image service did not return a task token.');

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    onStatus('NanoBanana is creating your image...');
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const result = await postImageRequest('/backend/generate_status.php', { task_token: task.task_token }, accessToken);
    if (result.status === 'completed' && result.url) return result;
    if (result.status !== 'processing') throw new Error('NanoBanana returned an unexpected task status.');
  }

  throw new Error('Image generation is taking too long. Please try again.');
}

export async function refreshGeneratedImageUrl(path) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to view generated images.');
  const result = await postImageRequest('/backend/generate_status.php', { path }, accessToken);
  return result.url;
}

export async function downloadGeneratedImage(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to download the generated image.');
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}