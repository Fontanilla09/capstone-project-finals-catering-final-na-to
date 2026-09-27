import { useEffect, useState } from 'react';
import { downloadGeneratedImage, generateImage } from '../lib/imageGeneration';
import DashboardPage from '../components/DashboardPage.jsx';

export default function VenueVisualizer() {
  const [file, setFile] = useState(null); const [filePreview, setFilePreview] = useState(''); const [prompt, setPrompt] = useState(''); const [preview, setPreview] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false);
  useEffect(() => () => filePreview && URL.revokeObjectURL(filePreview), [filePreview]);
  function chooseFile(event) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type) || nextFile.size > 4 * 1024 * 1024) {
      setStatus('Choose a JPG, PNG, or WEBP image smaller than 4 MB.');
      event.target.value = '';
      return;
    }
    setFile(nextFile);
    setFilePreview(URL.createObjectURL(nextFile));
    setStatus('');
  }
  async function generate(event) {
    event.preventDefault();
    if (!file || !prompt.trim()) { setStatus('Choose a venue photo and enter a prompt.'); return; }
    setLoading(true);
    setStatus('');
    try {
      const result = await generateImage({ image: file, prompt: prompt.trim(), onStatus: setStatus });
      setPreview(result.url);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }
  async function downloadPreview() {
    try {
      await downloadGeneratedImage(preview, 'caterai-venue-preview.png');
    } catch (error) {
      setStatus(error.message);
    }
  }
  const displayedImage = preview || filePreview;
  return <DashboardPage role="customer" section="visualizer"><div className="visualizer-workspace"><div className="visualizer-topbar"><div><p className="eyebrow">AI venue studio</p><h2>Visualize your venue</h2></div><span className="studio-status">{preview ? 'Preview ready' : 'Draft workspace'}</span></div><div className="visualizer-canvas">{displayedImage ? <img src={displayedImage} alt={preview ? 'Generated venue preview' : 'Selected venue'} /> : <label className="visualizer-dropzone"><span className="dropzone-icon">+</span><strong>Drop a venue photo here</strong><small>or click to browse JPG, PNG, or WEBP</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /></label>}</div><div className="visualizer-toolbar"><label className="visualizer-upload"><span>＋</span>{file ? file.name : 'Add venue photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /></label><span className="toolbar-divider" /><span className="toolbar-chip">{preview ? 'Generated preview' : 'Image to image'}</span><span className="toolbar-spacer" />{preview && <button className="visualizer-download" onClick={downloadPreview} type="button">Download</button>}</div><form className="visualizer-composer" onSubmit={generate}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the atmosphere you want to create..." required /><div className="composer-footer"><span className="composer-hint">Try: elegant garden wedding with warm lights</span><button className="button button-primary" disabled={loading} type="submit">{loading ? 'Generating...' : 'Generate preview'} <span>↗</span></button></div></form>{status && <p className="form-alert error-alert">{status}</p>}</div></DashboardPage>;
}
