// gen_image.js
// Usage: node gen_image.js "<prompt>" <inputImagePath> <outputPath>
// Requires: set environment variable GENAI_API_KEY with your API key

import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error(JSON.stringify({ success: false, error: 'Usage: node gen_image.js <prompt> <inputPath> <outputPath>' }));
    process.exit(2);
  }

  const [promptText, inputPath, outputPath] = args;
  const apiKey = process.env.GENAI_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ success: false, error: 'GENAI_API_KEY not set in environment' }));
    process.exit(2);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const imageData = fs.readFileSync(inputPath);
    const base64Image = imageData.toString('base64');

    const prompt = [
      { type: 'text', text: promptText },
      { type: 'image', mime_type: 'image/png', data: base64Image },
    ];

    const interaction = await ai.interactions.create({
      model: 'gemini-3.1-flash-image',
      input: prompt,
    });

    const generatedImage = interaction.output_image;
    if (generatedImage && generatedImage.data) {
      const buffer = Buffer.from(generatedImage.data, 'base64');
      fs.writeFileSync(outputPath, buffer);
      console.log(JSON.stringify({ success: true, output: outputPath }));
      process.exit(0);
    } else {
      console.error(JSON.stringify({ success: false, error: 'No image returned' }));
      process.exit(2);
    }
  } catch (err) {
    // Emit a richer error payload to help diagnose API errors (includes httpMeta when available)
    const out = {
      success: false,
      error: err.message || String(err),
      stack: err.stack || null,
    };
    if (err.httpMeta) out.httpMeta = err.httpMeta;
    try { console.error(JSON.stringify(out)); } catch (e) { console.error(String(out)); }
    process.exit(2);
  }
}

main();
