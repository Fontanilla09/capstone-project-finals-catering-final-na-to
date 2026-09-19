// Usage: node gen_image.js "<prompt>" <outputPath>

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
  if (!response.ok) throw new Error(body.error?.message || body.message || body.error || `NVIDIA NIM request failed (${response.status})`);
  return body;
}

async function saveImage(image, outputPath) {
  if (image.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(image.b64_json, 'base64'));
    return;
  }
  const imageUrl = image.url || image.image_url;
  if (!imageUrl) throw new Error('NVIDIA NIM returned no image data');
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image (${response.status})`);
  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) throw new Error('Usage: node gen_image.js <prompt> <outputPath>');
  const [promptText, outputPath] = args;
  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_API_KEY;
  const endpoint = process.env.NVIDIA_NIM_IMAGE_ENDPOINT || 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev';
  const model = process.env.NVIDIA_NIM_MODEL || 'black-forest-labs/FLUX.1-dev';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const requestBody = endpoint.includes('/genai/')
    ? { prompt: promptText, width: 1024, height: 1024, steps: 30, seed: 0 }
    : { model, prompt: promptText, size: '1024x1024', n: 1, response_format: 'b64_json' };
  const body = await requestJson(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });
  const image = imageDataFromResponse(body);
  if (!image) throw new Error('NVIDIA NIM completed without an image');
  await saveImage(image, outputPath);
  console.log(JSON.stringify({ success: true, output: outputPath }));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message || String(error) }));
  process.exit(2);
});
