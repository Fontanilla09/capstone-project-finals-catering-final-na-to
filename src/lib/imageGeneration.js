import { API_BASE } from './api';
import { supabase } from './supabase';
import { blockedPromptMessage, isPromptBlocked } from './themePromptGuard.js';

const pollIntervalMs = 3000;
const maxPollAttempts = 180;
const imageGenerationListeners = new Set();
let imageGenerationSnapshot = {
  loading: false,
  progress: 0,
  status: '',
  result: '',
  generatedImage: null,
};
let activeImageGeneration = null;

function updateImageGenerationSnapshot(updates) {
  imageGenerationSnapshot = { ...imageGenerationSnapshot, ...updates };
  imageGenerationListeners.forEach((listener) => listener());
}

export function getImageGenerationSnapshot() {
  return imageGenerationSnapshot;
}

export function subscribeToImageGeneration(listener) {
  imageGenerationListeners.add(listener);
  return () => imageGenerationListeners.delete(listener);
}

async function postImageRequest(path, body, accessToken, method = 'POST') {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
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

export async function generateImage({ image, prompt, aspectRatio = '1:1', onStatus = () => {}, onProgress = () => {} }) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalizedPrompt) throw new Error('Enter a description first.');
  if (isPromptBlocked(normalizedPrompt)) throw new Error(blockedPromptMessage);

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again before generating an image.');

  const form = new FormData();
  if (image) form.append('image', image);
  form.append('prompt', normalizedPrompt);
  form.append('aspect_ratio', aspectRatio);
  const task = await postImageRequest('/backend/generate.php', form, accessToken);
  if (!task.task_token) throw new Error('The image service did not return a task token.');

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    onStatus('NanoBanana is creating your image...');
    onProgress(Math.min(95, Math.round(((attempt + 1) / maxPollAttempts) * 95)));
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const result = await postImageRequest('/backend/generate_status.php', { task_token: task.task_token }, accessToken);
    if (result.status === 'completed' && result.url) {
      onProgress(100);
      return result;
    }
    if (result.status !== 'processing') throw new Error('NanoBanana returned an unexpected task status.');
  }

  throw new Error('Image generation is taking too long. Please try again.');
}

export async function generateImageInBackground({ image, prompt, aspectRatio = '1:1' }) {
  if (activeImageGeneration) return activeImageGeneration;

  const task = Promise.resolve().then(async () => {
    updateImageGenerationSnapshot({
      loading: true,
      progress: 0,
      status: 'Creating your studio preview...',
    });

    try {
      async function requestGeneration(includeReference) {
        return generateImage({
          image: includeReference ? image : null,
          prompt,
          aspectRatio,
          onStatus: (status) => updateImageGenerationSnapshot({ status }),
          onProgress: (progress) => updateImageGenerationSnapshot({ progress }),
        });
      }

      let usedReference = Boolean(image);
      let data;
      try {
        data = await requestGeneration(true);
      } catch (error) {
        const cannotFetchReference = image && /image fetch|access settings|file upload|image url/i.test(error.message);
        if (!cannotFetchReference) throw error;
        usedReference = false;
        updateImageGenerationSnapshot({
          progress: 0,
          status: 'Reference image is not publicly reachable. Creating the image from your prompt instead...',
        });
        data = await requestGeneration(false);
      }

      const generatedImage = {
        url: data.url,
        path: data.path,
        prompt: prompt.trim(),
        createdAt: new Date().toISOString(),
      };
      updateImageGenerationSnapshot({
        progress: 100,
        result: data.url,
        generatedImage,
        status: usedReference ? 'Photo generated successfully.' : 'Photo generated from your prompt.',
      });
      return { data, usedReference };
    } catch (error) {
      updateImageGenerationSnapshot({ status: error.message });
      throw error;
    } finally {
      updateImageGenerationSnapshot({ loading: false, progress: 0 });
    }
  });

  activeImageGeneration = task;
  try {
    return await task;
  } finally {
    if (activeImageGeneration === task) activeImageGeneration = null;
  }
}

export function clearImageGenerationResult(url) {
  if (imageGenerationSnapshot.result === url) {
    updateImageGenerationSnapshot({
      result: '',
      generatedImage: imageGenerationSnapshot.generatedImage?.url === url
        ? null
        : imageGenerationSnapshot.generatedImage,
    });
  }
}

export async function refreshGeneratedImageUrl(path) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to view generated images.');
  const result = await postImageRequest('/backend/generate_status.php', { path }, accessToken);
  return result.url;
}

export async function loadGeneratedImages() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to view generated images.');
  const result = await postImageRequest('/backend/image_history.php', null, accessToken, 'GET');
  return result.images;
}

export async function saveGeneratedImageToHistory(image) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to save generated images.');
  await postImageRequest('/backend/image_history.php', image, accessToken);
}

export async function deleteGeneratedImage(path) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to remove generated images.');
  return postImageRequest('/backend/image_history.php', { path }, accessToken, 'DELETE');
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