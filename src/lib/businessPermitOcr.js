import { createWorker } from 'tesseract.js';
import { extractPermitExpiryDate } from './businessPermitDate.js';

async function recognizeImage(worker, image) {
  const { data } = await worker.recognize(image);
  return data.text;
}

async function recognizePdf(worker, file, onProgress) {
  const [{ getDocument, GlobalWorkerOptions }, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdfDocument = await getDocument({ data: await file.arrayBuffer() }).promise;
  const textPages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.75, 3500 / baseViewport.width, 3500 / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare a PDF page for OCR.');
      await page.render({ canvasContext: context, viewport }).promise;
      textPages.push(await recognizeImage(worker, canvas));
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(Math.round((pageNumber / pdfDocument.numPages) * 100));
    }
  } finally {
    await pdfDocument.destroy();
  }
  return textPages.join('\n');
}

export async function readBusinessPermitExpiry(file, onProgress) {
  if (!(file instanceof File)) throw new Error('Choose a valid permit file before scanning.');
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Business permit must be a PDF, JPG, or PNG file.');
  }

  let worker;
  try {
    worker = await createWorker('eng');
    const text = file.type === 'application/pdf'
      ? await recognizePdf(worker, file, onProgress)
      : await recognizeImage(worker, file);
    return { text, expiryDate: extractPermitExpiryDate(text) };
  } finally {
    if (worker) await worker.terminate();
  }
}
