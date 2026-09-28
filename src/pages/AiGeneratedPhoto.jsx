import { useEffect, useRef, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { downloadGeneratedImage, generateImage, refreshGeneratedImageUrl } from '../lib/imageGeneration';
import DashboardPage from '../components/DashboardPage.jsx';

const previewSlots = ['A', 'B', 'C', 'D'];

export default function AiGeneratedPhoto() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [prompt, setPrompt] = useState('Create a polished event-service package photo with elegant venue setup, coordinated styling, and warm event atmosphere.');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caterai-ai-image-history') || '[]');
      return Array.isArray(saved)
        ? saved.map((entry) => typeof entry === 'string' ? { url: entry, path: '' } : entry).filter((entry) => typeof entry?.url === 'string')
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
    const savedImages = history.filter((entry) => entry.path);
    if (!savedImages.length) return undefined;

    Promise.all(savedImages.map(async (entry) => {
      try {
        return { ...entry, url: await refreshGeneratedImageUrl(entry.path) };
      } catch {
        return entry;
      }
    })).then((refreshed) => {
      if (!active) return;
      const byPath = new Map(refreshed.map((entry) => [entry.path, entry]));
      setHistory((current) => {
        const next = current.map((entry) => byPath.get(entry.path) || entry);
        localStorage.setItem('caterai-ai-image-history', JSON.stringify(next));
        return next;
      });
    });

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
        const generated = { url: generatedUrl, path: data.path };
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
    await downloadImage(result, 0);
  }

  async function downloadImage(url, index) {
    try {
      await downloadGeneratedImage(url, `caterai-generated-photo-${index + 1}.png`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function removeImage(imageEntry) {
    setHistory((current) => {
      const next = current.filter((item) => item.path !== imageEntry.path || item.url !== imageEntry.url);
      localStorage.setItem('caterai-ai-image-history', JSON.stringify(next));
      return next;
    });
    if (result === imageEntry.url) setResult('');
  }

  function resetResult() {
    setResult('');
    setStatus('');
  }

  return (
    <DashboardPage role="caterer" section="ai-photos">
      <div className="ai-studio-shell relative min-h-[620px] overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(201,109,75,0.10),transparent_28%),linear-gradient(180deg,#f7f1ed_0%,#f2ece6_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,_rgba(201,109,75,0.08),transparent_65%)]" />
        <div className="relative mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e2da] pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full border border-[#e2d7ce] bg-white/70 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c96d4b]">CaterAI Studio</span>
            </div>
            <h2 className="!mb-2 !font-sans !text-[clamp(2rem,4vw,3.5rem)] !leading-none !tracking-[-0.05em]">Create your next visual.</h2>
            <p className="!mb-0 max-w-xl text-sm text-[#6f776f]">Turn a catering idea into a polished package image ready to share with your customers.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#e3ddd5] bg-white/80 px-3 py-2 text-xs font-semibold text-[#68736a] shadow-[0_8px_20px_rgba(83,68,54,0.04)] backdrop-blur-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#8eaf86] shadow-[0_0_0_4px_rgba(142,175,134,0.12)]" /> Studio ready
          </div>
        </div>

        {status && <p className={`mb-5 rounded-2xl border px-4 py-3 text-sm shadow-[0_10px_24px_rgba(83,68,54,0.04)] ${loading ? 'border-[#dfe8d9] bg-[#edf4ea] text-[#4c684b]' : 'border-[#ecd6ca] bg-[#f7e5dd] text-[#9d503b]'}`}>{status}</p>}

        <div className="ai-generator-grid grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(420px,1.18fr)]">
          <form className="ai-control-panel rounded-[28px] border border-[#e6dfd7] bg-white/90 p-5 shadow-[0_18px_40px_rgba(83,68,54,0.06)] backdrop-blur-sm sm:p-6" onSubmit={generate}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-[#c96d4b]">01 / Describe</p>
                <h3 className="!m-0 !font-sans !text-lg !font-bold !tracking-[-0.02em]">What should we create?</h3>
              </div>
              <span className="rounded-full border border-[#eadfce] bg-[#f7f2ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e867e]">AI image</span>
            </div>

            <label className="mb-2 block text-xs font-bold text-[#414b43]" htmlFor="studio-prompt">Image prompt</label>
            <textarea id="studio-prompt" className="min-h-36 w-full resize-y rounded-2xl border border-[#ded8d0] bg-[#fcfbf9] p-4 text-sm leading-6 text-[#283129] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition focus:border-[#c96d4b] focus:ring-2 focus:ring-[#c96d4b]/15" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a venue setup, service style, mood, or event atmosphere..." required />

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#eee9e2] pt-5">
              <input ref={fileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setImage(event.target.files[0] || null); setStatus(''); }} />
              <button className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-[#cfc8bf] bg-[#fcfbf9] px-3 py-2 text-xs font-bold text-[#667168] transition hover:border-[#c96d4b] hover:bg-[#fffaf7] hover:text-[#c96d4b]" onClick={() => fileInputRef.current?.click()} type="button">
                <span className="text-lg leading-none">+</span> {image ? image.name : 'Add reference image'}
              </button>
              {image && <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5c8bd] bg-white text-lg font-bold text-[#a34f3a] transition hover:bg-[#f7e5dd]" onClick={() => { setImage(null); fileInputRef.current.value = ''; setStatus(''); }} type="button" title="Remove reference image" aria-label="Remove reference image">×</button>}
              <button className="ml-auto flex min-h-11 items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#c96d4b_0%,#b95c3d_100%)] px-5 py-2 text-sm font-bold text-white shadow-[0_12px_20px_rgba(201,109,75,0.22)] transition hover:translate-y-[-1px] hover:shadow-[0_16px_24px_rgba(201,109,75,0.24)] disabled:cursor-wait disabled:opacity-60" disabled={loading} type="submit">
                {loading ? 'Creating...' : 'Generate photo'} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>

          <section className="ai-preview-panel">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-[#c96d4b]">02 / Preview</p>
                <h3 className="!m-0 !font-sans !text-lg !font-bold !tracking-[-0.02em]">Generated images</h3>
              </div>
              {result && <div className="flex gap-2"><button className="rounded-full border border-[#ded8d0] bg-white px-3 py-2 text-xs font-bold text-[#59655c] shadow-sm transition hover:border-[#bfc8be]" onClick={downloadResult} type="button">Download</button><button className="rounded-full border border-[#ded8d0] bg-white px-3 py-2 text-xs font-bold text-[#59655c] shadow-sm transition hover:border-[#bfc8be]" onClick={resetResult} type="button">Clear</button></div>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {previewSlots.map((slot, index) => (
                <div className={`ai-preview-card group relative overflow-hidden rounded-[24px] border border-[#e6dfd7] bg-white shadow-[0_10px_24px_rgba(83,68,54,0.04)] ${index === 0 ? 'ai-preview-primary col-span-2' : ''}`} key={slot}>
                  {history[index] ? <><div className="ai-image-toolbar"><span>{index === 0 ? 'Primary' : `Variation 0${index}`}</span><div className="ai-image-actions"><button className="ai-image-action ai-image-download" onClick={() => downloadImage(history[index].url, index)} type="button" title="Download image" aria-label={`Download generated image ${index + 1}`}><Download size={16} strokeWidth={2} aria-hidden="true" /></button><button className="ai-image-action ai-image-remove" onClick={() => removeImage(history[index])} type="button" title="Remove image" aria-label={`Remove generated image ${index + 1}`}><Trash2 size={16} strokeWidth={2} aria-hidden="true" /></button></div></div><img className="ai-preview-image h-full w-full cursor-zoom-in object-contain" src={history[index].url} alt={`Generated catering package ${index + 1}`} onClick={() => setSelectedImage(history[index].url)} /></> : (
                    <div className="flex h-full min-h-32 flex-col items-center justify-center bg-[linear-gradient(135deg,#f5f0ea_0%,#fbfaf8_48%,#edf1ea_100%)] p-4 text-center">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6cd] bg-white text-[#c96d4b]">✦</div>
                      <span className="text-xs font-bold text-[#7e867e]">{loading && index === 0 ? 'Creating preview...' : 'Your preview will appear here'}</span>
                      <span className="mt-1 text-[10px] text-[#a0a59e]">{index === 0 ? 'Primary composition' : `Variation 0${index}`}</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2 py-1 text-[10px] font-bold text-[#7c857d] backdrop-blur">{index === 0 ? 'Primary' : `0${index}`}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {selectedImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged generated image" onClick={() => setSelectedImage(null)}><button className="image-lightbox-close" type="button" aria-label="Close image viewer" onClick={() => setSelectedImage(null)}>×</button><img src={selectedImage} alt="Enlarged generated catering image" onClick={(event) => event.stopPropagation()} /></div>}
    </DashboardPage>
  );
}
