// Usage: node gen_image.js "<prompt>" <inputPath> <outputPath> <publicInputUrl>

import fs from 'fs';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 36;

function getImageUrl(data) {
  const candidates = [
    data?.image_url,
    data?.url,
    data?.output_url,
    data?.output,
    data?.image,
    ...(Array.isArray(data?.images) ? data.images : []),
    ...(Array.isArray(data?.image_urls) ? data.image_urls : []),
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('http'));
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `Nano Banana request failed (${response.status})`);
  }
  return body;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    throw new Error('Usage: node gen_image.js <prompt> <inputPath> <outputPath> <publicInputUrl>');
  }

  const [promptText, inputPath, outputPath, publicInputUrl] = args;
  const apiKey = process.env.NANOBANANA_PRO_API_KEY;
  const baseUrl = (process.env.NANOBANANA_PRO_BASE_URL || 'https://nanobnana.com').replace(/\/$/, '');
  const model = process.env.NANOBANANA_PRO_MODEL || 'nano2pro';
  if (!apiKey) throw new Error('NANOBANANA_PRO_API_KEY not set in environment');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const created = await requestJson(`${baseUrl}/api/edit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: promptText,
      images: [publicInputUrl],
      model,
      aspect_ratio: '1:1',
      resolution: '1K',
      output_format: 'png',
    }),
  });

  const taskId = created.task_id || created.data?.task_id;
  if (!taskId) throw new Error('Nano Banana did not return a task_id');

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    const status = await requestJson(`${baseUrl}/api/status?task_id=${encodeURIComponent(taskId)}`, { headers });
    const statusData = status.data || status;
    const imageUrl = getImageUrl(statusData);
    const state = String(statusData.status || '').toUpperCase();

    if (imageUrl || ['SUCCESS', 'COMPLETED', 'DONE', 'SUCCEEDED'].includes(state)) {
      if (!imageUrl) throw new Error('Nano Banana completed without an image URL');
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Failed to download generated image (${imageResponse.status})`);
      fs.writeFileSync(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
      console.log(JSON.stringify({ success: true, output: outputPath }));
      return;
    }

    if (['FAILED', 'ERROR', 'CANCELLED'].includes(state)) {
      throw new Error(statusData.message || 'Nano Banana image generation failed');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Nano Banana generation timed out while waiting for task completion');
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message || String(error) }));
  process.exit(2);
});
