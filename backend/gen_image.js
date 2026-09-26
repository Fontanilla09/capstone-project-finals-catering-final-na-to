// Usage: node gen_image.js "<prompt>" <outputPath> [width] [height] [inputPath]

import fs from 'fs';

function imageDataFromResponse(body) {
  if (typeof body?.image === 'string') return { b64_json: body.image };
  if (Array.isArray(body?.artifacts) && body.artifacts[0]?.base64) return { b64_json: body.artifacts[0].base64 };
  const candidates = [
    ...(Array.isArray(body?.data) ? body.data : []),
    ...(Array.isArray(body?.images) ? body.images : []),
    body?.image,
  ];
  return candidates.find((item) => item?.b64_json || item?.url || item?.image_url) || null;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawDetail = body.error?.message || body.message || body.error || body.detail || body.title || body;
    const detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
    const provider = 'NanoBanana';
    throw new Error(`${provider} request failed (${response.status}): ${detail}`);
  }
  return body;
}

async function saveImage(image, outputPath) {
  if (image.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(image.b64_json, 'base64'));
    return;
  }
  const imageUrl = image.url || image.image_url;
  if (!imageUrl) throw new Error('NanoBanana returned no image data');
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image (${response.status})`);
  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

const API_BASE = process.env.NANOBANANA_API_BASE || 'https://nanobnana.com';

async function createNanoTask(promptText, inputUrl, aspectRatio) {
  const apiKey = process.env.NANOBANANA_API_KEY;
  if (!apiKey) throw new Error('NanoBanana API key is missing. Add NANOBANANA_API_KEY to the root .env file.');
  const model = process.env.NANOBANANA_MODEL || 'nano2';
  const endpoint = inputUrl ? '/api/edit' : '/api/generate';
  const body = inputUrl
    ? { prompt: promptText, images: [inputUrl], model, aspect_ratio: aspectRatio, resolution: '1K', output_format: 'png' }
    : { prompt: promptText, model, aspect_ratio: aspectRatio, size: '1K', format: 'png' };
  return requestJson(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
}

async function waitForNanoImage(taskId, outputPath) {
  const apiKey = process.env.NANOBANANA_API_KEY;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await requestJson(`${API_BASE}/api/status?task_id=${encodeURIComponent(taskId)}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
    });
    const task = result.data || result;
    if (task.status_code === 2) throw new Error(task.error_message || 'NanoBanana image generation failed.');
    if (task.status_code !== 1) continue;
    let response = task.response;
    if (typeof response === 'string' && response.trim().startsWith('[')) {
      response = JSON.parse(response);
    }
    const imageUrl = Array.isArray(response)
      ? response[0]
      : typeof response === 'string'
        ? response
        : response?.image_url || response?.url || response?.imageUrls?.[0] || response?.images?.[0]?.url;
    if (!imageUrl) throw new Error('NanoBanana completed without an image URL.');
    await saveImage({ url: imageUrl }, outputPath);
    return;
  }
  throw new Error('NanoBanana image generation timed out.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) throw new Error('Usage: node gen_image.js <prompt> <outputPath> [width] [height] [inputPath]');
  const [promptText, outputPath] = args;
  const inputPath = args[4] || '';
  const inputBaseUrl = process.env.NANOBANANA_PUBLIC_IMAGE_BASE_URL || '';
  const aspectRatio = process.env.NANOBANANA_ASPECT_RATIO || '1:1';
  let inputUrl = '';
  if (inputPath && fs.existsSync(inputPath)) {
    if (!inputBaseUrl.startsWith('https://')) {
      throw new Error('NanoBanana image-to-image requires a public HTTPS image URL. Set NANOBANANA_PUBLIC_IMAGE_BASE_URL in .env.');
    }
    const fileName = inputPath.split(/[\\/]/).pop();
    inputUrl = `${inputBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(fileName)}`;
  }
  const task = await createNanoTask(promptText, inputUrl, aspectRatio);
  const taskId = task.task_id || task.data?.task_id;
  if (!taskId) throw new Error('NanoBanana did not return a task ID.');
  await waitForNanoImage(taskId, outputPath);
  console.log(JSON.stringify({ success: true, output: outputPath, taskId }));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message || String(error) }));
  process.exit(2);
});
