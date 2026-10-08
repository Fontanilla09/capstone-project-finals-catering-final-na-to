import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, LoaderCircle, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { deleteGeneratedImage, downloadGeneratedImage, generateImage, loadGeneratedImages, refreshGeneratedImageUrl, saveGeneratedImageToHistory } from '../lib/imageGeneration';
import DashboardPage from '../components/DashboardPage.jsx';

export default function AiGeneratedPhoto() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prompt, setPrompt] = useState('Create a polished event-service package photo with elegant venue setup, coordinated styling, and warm event atmosphere.');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caterai-ai-image-history') || '[]');
      return Array.isArray(saved)
        ? saved.map((entry) => typeof entry === 'string' ? { url: entry, path: '', prompt: '' } : entry).filter((entry) => typeof entry?.url === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    if (!selectedImage) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedImage(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedImage]);

  useEffect(() => {
    let active = true;
    async function restoreHistory() {
      try {
        const localHistory = JSON.parse(localStorage.getItem('caterai-ai-image-history') || '[]');
        const localEntries = Array.isArray(localHistory)
          ? localHistory.map((entry) => typeof entry === 'string' ? { url: entry, path: '', prompt: '' } : entry).filter((entry) => typeof entry?.url === 'string')
          : [];
        const legacyEntries = localEntries.filter((entry) => entry.path);
        await Promise.all(legacyEntries.map((entry) => saveGeneratedImageToHistory(entry)));
        const savedImages = await loadGeneratedImages();
        const savedPaths = new Set(savedImages.map((entry) => entry.path));
        const olderImages = await Promise.all(localEntries
          .filter((entry) => !entry.path || !savedPaths.has(entry.path))
          .map(async (entry) => {
            if (!entry.path) return entry;
            try {
              return { ...entry, url: await refreshGeneratedImageUrl(entry.path) };
            } catch {
              return null;
            }
          }));
        if (!active) return;
        const next = [...savedImages, ...olderImages.filter(Boolean)].slice(0, 12);
        setHistory(next);
        localStorage.setItem('caterai-ai-image-history', JSON.stringify(next));
      } catch (error) {
        if (active) setStatus(`Could not load saved image history: ${error.message}`);
      }
    }
    restoreHistory();

    return () => { active = false; };
  }, []);

  async function generate(event) {
    event.preventDefault();
    if (!prompt.trim()) {
      setStatus('Enter a description first.');
      return;
    }
    if (image && !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      setStatus('Base photo must be JPG, PNG, or WEBP.');
      return;
    }
    if (image && image.size > 5 * 1024 * 1024) {
      setStatus('Base photo must be smaller than 5MB.');
      return;
    }

    setLoading(true);
    setStatus('Creating your studio preview...');
    setResult('');

    try {
      async function requestGeneration(includeReference) {
        return generateImage({
          image: includeReference ? image : null,
          prompt: prompt.trim(),
          aspectRatio: '1:1',
          onStatus: setStatus,
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
        setStatus('Reference image is not publicly reachable. Creating the image from your prompt instead...');
        data = await requestGeneration(false);
      }
      const generatedUrl = data.url;
      setResult(generatedUrl);
      setHistory((current) => {
        const generated = { url: generatedUrl, path: data.path, prompt: prompt.trim(), createdAt: new Date().toISOString() };
        const next = [generated, ...current.filter((entry) => entry.path !== generated.path && entry.url !== generated.url)].slice(0, 12);
        localStorage.setItem('caterai-ai-image-history', JSON.stringify(next));
        return next;
      });
      setStatus(usedReference ? 'Photo generated successfully.' : 'Photo generated from your prompt.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadResult() {
    await downloadImage(result || history[0]?.url, 0);
  }

  async function downloadImage(url, index) {
    try {
      await downloadGeneratedImage(url, `caterai-generated-photo-${index + 1}.png`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function removeImage(imageEntry) {
    let storageDeleted = true;
    if (imageEntry.path) {
      try {
        const deletion = await deleteGeneratedImage(imageEntry.path);
        storageDeleted = deletion.storageDeleted !== false;
      } catch (error) {
        setStatus(error.message);
        return;
      }
    }
    setHistory((current) => {
      const next = current.filter((item) => item.path !== imageEntry.path || item.url !== imageEntry.url);
      localStorage.setItem('caterai-ai-image-history', JSON.stringify(next));
      return next;
    });
    if (result === imageEntry.url) setResult('');
    if (!storageDeleted) setStatus('Removed from history, but the stored image file could not be deleted.');
  }

  const latestImage = history[0];
  const latestUrl = result || latestImage?.url;
  const displayedImage = history.find((entry) => entry.url === latestUrl) || latestImage;

  return (
    <DashboardPage role="caterer" section="ai-photos">
      <div className="ai-studio-shell">
        <header className="ai-studio-heading">
          <div><span className="ai-studio-kicker"><Sparkles size={14} /> CATERAI IMAGE STUDIO</span><h2>Create visuals for your next event</h2><p>Describe the scene you want. CaterAI will turn your idea into a polished catering photo.</p></div>
          <span className="ai-studio-ready"><i /> AI image generator</span>
        </header>
        {status && <p className={`ai-studio-status ${loading ? 'is-loading' : ''}`} role="status">{status}</p>}
        <div className="ai-generator-grid">
          <form className="ai-control-panel" onSubmit={generate}>
            <div className="ai-panel-title"><span>01</span><div><h3>Describe your image</h3><p>A little detail helps create a more useful result.</p></div></div>
            <label htmlFor="studio-prompt">Your prompt</label>
            <textarea id="studio-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: An elegant wedding buffet with white florals, candlelight, and beautifully arranged dishes..." required />
            <div className="ai-prompt-tip"><WandSparkles size={15} /><span>Try describing the event, setting, colors, and mood.</span></div>
            <div className="ai-reference-wrap">
              <input ref={fileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setImage(event.target.files[0] || null); setStatus(''); }} />
              <button className="ai-reference-button" onClick={() => fileInputRef.current?.click()} type="button"><ImagePlus size={17} /><span>{image ? image.name : 'Add a reference photo'}</span></button>
              {image && <button className="ai-reference-remove" onClick={() => { setImage(null); fileInputRef.current.value = ''; setStatus(''); }} type="button" aria-label="Remove reference photo">×</button>}
              <small>JPG, PNG or WEBP · up to 5 MB</small>
            </div>
            <button className="ai-generate-button" disabled={loading} type="submit">{loading ? <><LoaderCircle className="ai-spin" size={18} /> Creating your image…</> : <><Sparkles size={17} /> Generate image</>}</button>
            <p className="ai-generate-note">Your generated images will be saved in your history.</p>
          </form>
          <section className="ai-result-section" aria-label="Image preview">
            <div className="ai-section-heading"><div><span>02</span><div><h3>Preview</h3><p>Your latest generated image</p></div></div>{latestUrl && <button className="ai-download-button" onClick={downloadResult} type="button"><Download size={15} /> Download</button>}</div>
            <div className={`ai-result-frame ${loading ? 'is-generating' : ''}`}>
              {latestUrl ? <><img src={latestUrl} alt="Latest generated catering image" onClick={() => setSelectedImage(latestUrl)} /><button className="ai-zoom-hint" type="button" onClick={() => setSelectedImage(latestUrl)}>View full size</button></> : <div className="ai-result-empty"><div className="ai-empty-icon"><Sparkles size={22} /></div><strong>{loading ? 'Creating your image' : 'Your image will appear here'}</strong><span>{loading ? 'This can take a little while. Keep this page open.' : 'Write a prompt and generate your first visual.'}</span>{loading && <LoaderCircle className="ai-spin ai-loading-icon" size={20} />}</div>}
              {loading && latestUrl && <div className="ai-generating-overlay"><LoaderCircle className="ai-spin" size={20} /> Creating a new image…</div>}
            </div>
            {latestUrl && displayedImage?.prompt && <p className="ai-latest-prompt"><span>Prompt</span>{displayedImage.prompt}</p>}
          </section>
        </div>
        <section className="ai-history-section">
          <div className="ai-section-heading ai-history-heading"><div><span>03</span><div><h3>Your image history</h3><p>Revisit, download, or remove a previous creation.</p></div></div><span className="ai-history-count">{history.length} {history.length === 1 ? 'image' : 'images'}</span></div>
          {history.length ? <div className="ai-history-grid">{history.map((entry, index) => <article className="ai-history-card" key={`${entry.path || entry.url}-${index}`}><button className="ai-history-image-button" type="button" onClick={() => { setResult(entry.url); setSelectedImage(entry.url); }} aria-label="View generated image"><img src={entry.url} alt={`Generated catering image ${index + 1}`} /></button><div className="ai-history-copy"><div className="ai-history-meta"><span>{index === 0 ? 'LATEST' : 'GENERATED IMAGE'}</span>{entry.createdAt && <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString()}</time>}</div><p>{entry.prompt || 'Prompt details are unavailable for this saved image.'}</p><div className="ai-history-actions"><button type="button" onClick={() => { setPrompt(entry.prompt || prompt); setResult(entry.url); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><WandSparkles size={14} /> Use prompt</button><button type="button" onClick={() => downloadImage(entry.url, index)} aria-label="Download image"><Download size={15} /></button><button type="button" onClick={() => removeImage(entry)} aria-label="Remove image from history"><Trash2 size={15} /></button></div></div></article>)}</div> : <div className="ai-history-empty"><ImagePlus size={19} /><span>Your generated images will be collected here.</span></div>}
        </section>
      </div>
      {selectedImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged generated image" onClick={() => setSelectedImage(null)}><button className="image-lightbox-close" type="button" aria-label="Close image viewer" onClick={() => setSelectedImage(null)}>×</button><img src={selectedImage} alt="Enlarged generated catering image" onClick={(event) => event.stopPropagation()} /></div>}
    </DashboardPage>
  );
}
