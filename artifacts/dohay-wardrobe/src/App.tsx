import { useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  useAnalyzeGarment,
  useChatAboutGarment,
  useGetWardrobeSummary,
  useListWardrobeItems,
  useRecommendOutfits,
  useRequestWardrobeUploadUrl,
  useSaveWardrobeItem,
  getGetWardrobeSummaryQueryKey,
  getListWardrobeItemsQueryKey,
} from '@workspace/api-client-react';
import type { AttributeSource, GarmentAnalysis, WardrobeItem, WardrobeItemInput } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, CircleHelp,
  ClipboardList, CloudUpload, ImagePlus, Loader2, MessageCircle, Plus,
  RefreshCw, Send, Shirt, Sparkles, Trash2, X, LogOut,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { type ReactNode, useEffect } from 'react';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
type SupportedImageType = (typeof allowedTypes)[number];
function supportedImageType(file: File): SupportedImageType | null {
  if ((allowedTypes as readonly string[]).includes(file.type)) return file.type as SupportedImageType;
  const extensionType = /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : '';
  return extensionType ? extensionType as SupportedImageType : null;
}
const prettySource = (source?: string) => {
  if (source === 'visually_observed') return 'Observed';
  if (source === 'user_provided') return 'You told us';
  if (source === 'label_verified') return 'Label verified';
  if (source === 'externally_verified') return 'Verified';
  return 'Estimate';
};
const normalizeAttribute = (attribute: string) => {
  const normalized = attribute.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'fitestimate') return 'fit';
  if (normalized === 'fabric') return 'fabricestimate';
  if (normalized === 'maincolor') return 'primarycolor';
  return normalized;
};
const sourceFor = (sources: AttributeSource[], attribute: string) =>
  sources.find((entry) => normalizeAttribute(entry.attribute) === normalizeAttribute(attribute))?.source;
const imageUrl = (path: string) => `/api/storage${path}`;
const isDuplicateConflict = (error: unknown) =>
  !!error && typeof error === 'object' && 'status' in error && (error as { status?: unknown }).status === 409;

function Header() {
  const [location] = useLocation();
  const { isSignedIn } = useUser();
  const { signOut } = useClerk();
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="DOHAY wardrobe home" data-testid="link-home">
        <span className="brand-mark">d</span><span className="brand-word">DOHAY</span>
      </Link>
      <nav className="header-right" aria-label="Main navigation">
        {isSignedIn ? <>
          <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} data-testid="link-wardrobe">Wardrobe</Link>
          <Link href="/capture" className={`nav-link ${location === '/capture' ? 'active' : ''}`} data-testid="link-add-item">Add a piece</Link>
          <button className="nav-link" onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={13} /> Sign out</button>
        </> : <>
          <Link href="/sign-in" className="nav-link" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="button" style={{ padding: '10px 15px', fontSize: 12 }} data-testid="link-sign-up">Create account</Link>
        </>}
      </nav>
    </header>
  );
}

function SignedOut() {
  return <LandingPage />;
}

function useSignedIn() {
  const { isSignedIn, isLoaded } = useUser();
  return !!isLoaded && !!isSignedIn;
}

function LandingPage() {
  return <main className="page-wrap">
    <section className="landing-hero">
      <div className="landing-copy">
        <span className="eyebrow">A more thoughtful way to get dressed</span>
        <h1 className="hero-title">Your closet,<br /><em>seen anew.</em></h1>
        <p className="subcopy">DOHAY is a personal wardrobe companion that helps you notice what you own, remember why you love it, and find new ways to wear it.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
          <Link className="button" href="/sign-up" data-testid="button-landing-sign-up">Begin your wardrobe <ArrowRight size={15} /></Link>
          <Link className="button button-quiet" href="/sign-in" data-testid="button-landing-sign-in">I have an account</Link>
        </div>
      </div>
      <div className="landing-art" role="img" aria-label="An illustrated, neatly arranged wardrobe in warm colors">
        <div className="art-sun" />
        <div className="art-rack"><span /><span /><span /><span /></div>
        <div className="art-clothes"><i /><i /><i /><i /><i /></div>
        <div className="art-caption"><span>01 / YOUR PERSONAL EDIT</span><strong>Wear it like you mean it.</strong></div>
      </div>
    </section>
    <section className="landing-story">
      <div className="story-index">01 <span>— WHAT WE NOTICE</span></div>
      <div><h2>Details, without<br />pretending to know it all.</h2><p>We can describe what’s visible: a color, a shape, a pattern. Anything uncertain stays clearly marked as an estimate. A care label or your own knowledge always has the final word.</p></div>
    </section>
    <section className="landing-three">
      <article><span className="eyebrow">01 / Capture</span><h3>Start with a photo.</h3><p>Show the front, the back, or that little detail you love. Add several angles for a fuller picture.</p></article>
      <article><span className="eyebrow">02 / Refine</span><h3>Make it yours.</h3><p>Chat through the details and edit anything that doesn’t feel quite right.</p></article>
      <article><span className="eyebrow">03 / Wear</span><h3>Find the next outfit.</h3><p>Get ideas from the things you already own, with your style and your day in mind.</p></article>
    </section>
    <section className="landing-end"><span className="eyebrow">A little more you, every morning</span><h2>Make room for the pieces<br />you already love.</h2><Link className="button" href="/sign-up">Create your private wardrobe <ArrowRight size={15} /></Link></section>
    <footer className="landing-footer"><Link href="/" className="brand"><span className="brand-mark">d</span><span className="brand-word">DOHAY</span></Link><span>Your wardrobe belongs to you.</span></footer>
  </main>;
}

function WardrobePage() {
  const signedIn = useSignedIn();
  const { data: items, isLoading, isError, refetch } = useListWardrobeItems({ query: { enabled: signedIn, queryKey: getListWardrobeItemsQueryKey() } });
  const { data: summary } = useGetWardrobeSummary({ query: { enabled: signedIn, queryKey: getGetWardrobeSummaryQueryKey() } });
  const [category, setCategory] = useState('All pieces');
  const [recommendItem, setRecommendItem] = useState<WardrobeItem | null>(null);
  const [prompt, setPrompt] = useState('');
  const recommend = useRecommendOutfits();
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const categories = useMemo(() => ['All pieces', ...Array.from(new Set((items ?? []).map((item) => item.category).filter(Boolean)))], [items]);
  const shownItems = (items ?? []).filter((item) => category === 'All pieces' || item.category === category);
  const runRecommendation = (item: WardrobeItem) => {
    setRecommendItem(item);
    recommend.mutate({ data: { itemId: item.id, ...(prompt.trim() ? { prompt: prompt.trim() } : {}) } });
  };

  if (!signedIn) return <SignedOut />;
  return (
    <main className="page-wrap">
      <div className="hero-row">
        <div>
          <div className="eyebrow">Your personal closet companion</div>
          <h1 className="hero-title">Wear what you<br />already love.</h1>
          <p className="subcopy">A considered little catalogue of the pieces that make getting dressed feel like you.</p>
        </div>
        <Link className="button" href="/capture" data-testid="button-capture-new"><Plus size={16} /> Add a piece</Link>
      </div>

      <section className="stat-strip" aria-label="Wardrobe summary" data-testid="summary-wardrobe">
        <div><div className="stat-label">In your wardrobe</div><div className="stat-number">{summary?.totalItems ?? items?.length ?? '—'} <span style={{ fontSize: 18 }}>pieces</span></div></div>
        <div className="stat-note">{summary?.totalItems ? 'A growing edit of what you reach for.' : 'Every good wardrobe starts with one.'}</div>
      </section>

      <section aria-labelledby="pieces-heading">
        <div className="section-heading">
          <div><h2 id="pieces-heading">Your pieces</h2><div className="section-caption">Saved for you, and only you.</div></div>
          {!!items?.length && <span className="eyebrow">{items.length} saved</span>}
        </div>
        {isLoading ? <div className="wardrobe-grid" aria-label="Loading wardrobe">{[0, 1, 2, 3].map((n) => <div className="skeleton skeleton-card" key={n} />)}</div> :
          isError ? <div className="error-panel"><div className="empty-icon"><CircleHelp /></div><h3>We couldn't open your wardrobe</h3><p>Your saved pieces are safe. Try loading them again in a moment.</p><button className="button button-secondary" onClick={() => void refetch()} data-testid="button-retry-wardrobe"><RefreshCw size={14} /> Try again</button></div> :
          !items?.length ? <div className="empty-panel"><div className="empty-icon"><Shirt size={24} /></div><div className="eyebrow">A little room to begin</div><h3>Your wardrobe starts here.</h3><p>Photograph a piece you love. We’ll help describe what we can see, and leave the rest for you to confirm.</p><Link className="button" href="/capture" data-testid="button-empty-add"><Camera size={15} /> Photograph your first piece</Link></div> :
          <>
            {categories.length > 2 && <div className="filter-row" aria-label="Filter pieces by category">{categories.map((c) => <button key={c} className={`filter-pill ${category === c ? 'selected' : ''}`} onClick={() => setCategory(c)} data-testid={`filter-category-${c.toLowerCase().replace(/\s+/g, '-')}`}>{c}</button>)}</div>}
            {shownItems.length ? <div className="wardrobe-grid">{shownItems.map((item) => (
              <article className="item-card" key={item.id} data-testid={`card-wardrobe-item-${item.id}`}>
                <div className="item-image">
                  {item.imagePath ? <img src={imageUrl(item.imagePath)} alt={`${item.primaryColor} ${item.subtype || item.category}`} loading="lazy" /> : <div className="image-placeholder"><Shirt size={50} strokeWidth={1.1} /></div>}
                </div>
                <div className="item-body">
                  <div className="item-type">{item.category}{item.subtype ? ` / ${item.subtype}` : ''}</div>
                  <h3 className="item-name">{item.primaryColor} {item.subtype || item.category}</h3>
                  <div className="item-footer">
                    <div className="color-dots">{[item.primaryColor, ...item.secondaryColors].slice(0, 3).map((color, i) => <span key={`${color}-${i}`} className="color-dot" title={color} style={{ background: namedColor(color) }} />)}</div>
                    <span className="confidence">{item.pattern || item.style || 'Saved piece'}</span>
                  </div>
                  <div className="card-actions"><button className="button button-secondary" onClick={() => runRecommendation(item)} disabled={recommend.isPending} data-testid={`button-outfit-${item.id}`}><Sparkles size={13} /> Outfit ideas</button></div>
                </div>
              </article>
            ))}</div> : <div className="empty-panel"><div className="empty-icon"><Shirt /></div><h3>No {category.toLowerCase()} yet.</h3><p>Try another category or add a piece to your collection.</p></div>}
          </>}
      </section>

      {recommendItem && <section className="recommend-layout" aria-live="polite">
        <div><span className="eyebrow">A fresh way to wear it</span><h2>Style this piece</h2><p>Ideas are built from your saved wardrobe. Add a mood, occasion, or weather note if you like.</p></div>
        <button className="button" onClick={() => runRecommendation(recommendItem)} disabled={recommend.isPending} data-testid="button-generate-outfits">{recommend.isPending ? <Loader2 className="spin-icon" size={15} /> : <Sparkles size={15} />}{recommend.isPending ? 'Thinking…' : 'Suggest outfits'}</button>
        <div className="recommend-result">
          <label className="field" style={{ marginTop: 0 }}><span className="small-help">Optional direction</span><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A relaxed gallery afternoon…" data-testid="input-outfit-prompt" /></label>
          {recommend.isError && <div className="alert" role="alert">Outfit ideas are taking a moment. Try again.</div>}
          {recommend.data && <><p>{recommend.data.introduction}</p><div className="outfit-list">{recommend.data.outfits.map((outfit, index) => <article className="outfit-card" key={`${outfit.name}-${index}`}><h3>{outfit.name}</h3><div className="eyebrow">The combination</div><p>{outfit.pieces.join(' · ')}</p><p>{outfit.rationale}</p></article>)}</div></>}
        </div>
      </section>}
      {notice && <div className="toast-message" role="status">{notice}</div>}
    </main>
  );
}

function namedColor(value: string): string {
  const colorMap: Record<string, string> = { black: '#282b28', white: '#f4f0e6', ivory: '#ece4cf', cream: '#e9dfc7', navy: '#34475a', blue: '#68879c', red: '#a84f47', green: '#617d6b', olive: '#858361', beige: '#c6b79a', tan: '#b4916d', brown: '#80634e', grey: '#969791', gray: '#969791', pink: '#d39d9d', yellow: '#ddc36d', orange: '#c98052', purple: '#867387' };
  const key = value.toLowerCase().split(/[\s,/-]/)[0];
  return colorMap[key] ?? '#a5a393';
}

type LocalPhoto = { file: File; preview: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type DraftFields = {
  category: string; subtype: string; primaryColor: string; secondaryColors: string; pattern: string;
  designDetails: string; silhouette: string; fit: string; style: string; fabricEstimate: string;
  constructionFeatures: string; occasions: string; seasons: string; brand: string; size: string;
  purchasePrice: string; purchaseDate: string; notes: string;
};
const emptyFields: DraftFields = {
  category: '', subtype: '', primaryColor: '', secondaryColors: '', pattern: '', designDetails: '',
  silhouette: '', fit: '', style: '', fabricEstimate: '', constructionFeatures: '', occasions: '',
  seasons: '', brand: '', size: '', purchasePrice: '', purchaseDate: '', notes: '',
};
const splitList = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
const analysisFields = (analysis: GarmentAnalysis): DraftFields => ({
  ...emptyFields, category: analysis.category, subtype: analysis.subtype, primaryColor: analysis.primaryColor,
  secondaryColors: analysis.secondaryColors.join(', '), pattern: analysis.pattern, designDetails: analysis.designDetails.join(', '),
  silhouette: analysis.silhouette, fit: analysis.fitEstimate, style: analysis.style, fabricEstimate: analysis.fabricEstimate,
  constructionFeatures: analysis.constructionFeatures.join(', '), occasions: analysis.occasions.join(', '),
  seasons: analysis.seasons.join(', '),
});

function CapturePage() {
  const signedIn = useSignedIn();
  const queryClient = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const browseInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [fields, setFields] = useState<DraftFields>(emptyFields);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [duplicateOffer, setDuplicateOffer] = useState(false);
  const [toast, setToast] = useState('');
  const [, setLocation] = useLocation();
  const requestUpload = useRequestWardrobeUploadUrl();
  const analyze = useAnalyzeGarment();
  const chat = useChatAboutGarment();
  const save = useSaveWardrobeItem();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setError('');
    const candidates = Array.from(fileList);
    const valid: File[] = [];
    for (const file of candidates) {
      if (!supportedImageType(file)) { setError(`${file.name} isn't a supported image. Choose JPEG, PNG, or WebP.`); continue; }
      if (file.size > 15 * 1024 * 1024) { setError(`${file.name} is larger than 15 MB.`); continue; }
      valid.push(file);
    }
    const availableSlots = Math.max(0, 5 - photos.length);
    const additions: LocalPhoto[] = valid
      .slice(0, availableSlots)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...additions].slice(0, 5));
    if (photos.length + valid.length > 5) setError('You can add up to five photos for one garment.');
  };
  const removePhoto = (index: number) => {
    const removed = photos[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    setPhotos((current) => current.filter((_, i) => i !== index));
  };
  const reset = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setPhotos([]); setAnalysis(null); setPaths([]); setFields(emptyFields); setMessages([]); setNote(''); setError(''); setEditing(false); setDuplicateOffer(false);
  };
  const uploadAndAnalyze = async () => {
    setError('');
    if (!photos.length) { setError('Add at least one clear photo before asking for a description.'); return; }
    try {
      const uploadedPaths: string[] = [];
      for (const { file } of photos) {
        const type = supportedImageType(file);
        if (!type) throw new Error(`${file.name} isn't a supported image. Choose JPEG, PNG, or WebP.`);
        const target = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: type } });
        const response = await fetch(target.uploadURL, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
        if (!response.ok) throw new Error('One of the photos could not be uploaded. Please try again.');
        uploadedPaths.push(target.objectPath);
      }
      setPaths(uploadedPaths);
      const result = await analyze.mutateAsync({ data: { objectPaths: uploadedPaths, ...(note.trim() ? { userNote: note.trim() } : {}) } });
      setAnalysis(result);
      setFields(analysisFields(result));
      setMessages([{ role: 'assistant', content: 'Here’s what I can make out from the photos. Tell me if you’d like to clarify a detail before saving.' }]);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t finish analyzing these photos. Please try again.');
    }
  };
  const sendChat = async () => {
    if (!analysis || !chatText.trim() || chat.isPending) return;
    const userMessage: ChatMessage = { role: 'user', content: chatText.trim() };
    const updated = [...messages, userMessage];
    setMessages(updated); setChatText('');
    try {
      const result = await chat.mutateAsync({ data: { analysis, messages: updated } });
      setMessages([...updated, { role: 'assistant', content: result.reply }]);
    } catch {
      setMessages([...updated, { role: 'assistant', content: 'I couldn’t send that just now. Please try again.' }]);
    }
  };
  const setField = (key: keyof DraftFields, value: string) => {
    setDuplicateOffer(false);
    setError('');
    setFields((current) => ({ ...current, [key]: value }));
  };
  const saveItem = (allowDuplicate = false) => {
    if (!analysis || !paths.length || !fields.category.trim() || !fields.primaryColor.trim()) {
      setError('Please add at least a category and main color before saving.');
      setEditing(true); return;
    }
    const payload: WardrobeItemInput = {
      imagePath: paths[0], additionalImagePaths: paths.slice(1, 5), category: fields.category.trim(),
      subtype: fields.subtype.trim(), primaryColor: fields.primaryColor.trim(), secondaryColors: splitList(fields.secondaryColors),
      pattern: fields.pattern.trim(), designDetails: splitList(fields.designDetails), silhouette: fields.silhouette.trim(),
      fit: fields.fit.trim() || null, style: fields.style.trim(), fabricEstimate: fields.fabricEstimate.trim() || null,
      fabricComposition: null, constructionFeatures: splitList(fields.constructionFeatures), occasions: splitList(fields.occasions),
      seasons: splitList(fields.seasons), brand: fields.brand.trim() || null, size: fields.size.trim() || null,
      purchasePrice: fields.purchasePrice.trim() ? Number(fields.purchasePrice) : null, purchaseDate: fields.purchaseDate || null,
      notes: fields.notes.trim() || null, attributeSources: approvedAttributeSources(analysis, fields), allowDuplicate,
    };
    if (payload.purchasePrice !== null && (!Number.isFinite(payload.purchasePrice) || payload.purchasePrice < 0)) {
      setError('Enter a valid, non-negative price or leave it blank.'); setEditing(true); return;
    }
    setError('');
    save.mutate({ data: payload }, {
      onSuccess: async () => {
        setDuplicateOffer(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListWardrobeItemsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetWardrobeSummaryQueryKey() }),
        ]);
        setToast('Saved to your private wardrobe.');
        reset();
        setLocation('/');
      },
      onError: (cause) => {
        if (isDuplicateConflict(cause) && !allowDuplicate) {
          setError('');
          setDuplicateOffer(true);
          return;
        }
        setDuplicateOffer(false);
        setError('This piece wasn’t saved. Your photos are still here; please try again.');
      },
    });
  };

  if (!signedIn) return <SignedOut />;
  const pending = requestUpload.isPending || analyze.isPending;
  const sources = analysis ? approvedAttributeSources(analysis, fields) : [];
  const detailItems = analysis ? [
    ['Category', fields.category, 'category'], ['Main color', fields.primaryColor, 'primary color'],
    ['Pattern', fields.pattern, 'pattern'], ['Silhouette', fields.silhouette, 'silhouette'],
    ['Fit', fields.fit, 'fit'], ['Fabric look', fields.fabricEstimate, 'fabricEstimate'],
    ['Style', fields.style, 'style'],
  ] : [];

  return (
    <main className="page-wrap">
      <div className="capture-intro">
        <Link href="/" className="nav-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 0 }} data-testid="link-back-wardrobe"><ArrowLeft size={14} /> Your wardrobe</Link>
        <div className="eyebrow" style={{ marginTop: 18 }}>A thoughtful first look</div>
        <h1>Let’s meet<br />your garment.</h1>
        <p className="subcopy">A few photos are plenty. We’ll describe what’s visible, flag what’s only an estimate, and let you make the final call.</p>
      </div>
      <div className="capture-layout">
        <section className="capture-panel">
          <div className="capture-step"><span className="step-dot">01</span> Photograph your piece</div>
          <div className="capture-drop">
            <div className="empty-icon"><ImagePlus size={24} /></div>
            <h3>Show us the whole story.</h3>
            <p>Front, back, a detail, or the care label. Up to five JPEG, PNG, or WebP images.</p>
            <div className="upload-actions">
              <button className="button" onClick={() => cameraInput.current?.click()} disabled={pending || photos.length >= 5} data-testid="button-open-camera"><Camera size={15} /> Take a photo</button>
              <button className="button button-secondary" onClick={() => browseInput.current?.click()} disabled={pending || photos.length >= 5} data-testid="button-choose-photos"><CloudUpload size={15} /> Choose photos</button>
            </div>
            <input ref={cameraInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ''; }} aria-label="Take a garment photo" data-testid="input-camera-photo" />
            <input ref={browseInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ''; }} aria-label="Choose garment photos" data-testid="input-garment-photos" />
          </div>
          {photos.length > 0 && <div className="preview-grid" aria-label={`${photos.length} selected photos`}>{photos.map((photo, index) => <div className="preview-cell" key={`${photo.file.name}-${index}`}><img src={photo.preview} alt={`Selected garment view ${index + 1}`} /><button className="preview-remove" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`} data-testid={`button-remove-photo-${index}`}><X size={13} /></button></div>)}</div>}
          {!analysis && <div className="field"><label htmlFor="first-note">Anything you already know? <span className="small-help">(optional)</span></label><textarea id="first-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="A gift from my sister; I think it’s a linen blend…" data-testid="input-garment-note" /><span className="small-help">Your words will be marked as yours, not visually observed.</span></div>}
          {error && <div className="alert" role="alert" data-testid="status-capture-error">{error}</div>}
          {!analysis && <button className="button" style={{ width: '100%', marginTop: 17 }} onClick={() => void uploadAndAnalyze()} disabled={pending || !photos.length} data-testid="button-analyze-garment">
            {pending ? <><Loader2 className="spin-icon" size={15} /> {requestUpload.isPending ? 'Preparing private upload…' : 'Looking closely…'}</> : <><Sparkles size={15} /> Help me describe it</>}
          </button>}
          {pending && <div className="busy-state" aria-live="polite"><div className="busy-orbit" /><p>Taking a closer look at the details you shared.</p></div>}
        </section>

        <section className="capture-panel">
          <div className="capture-step"><span className="step-dot">02</span> Review, refine, then decide</div>
          {!analysis ? <div className="empty-panel" style={{ padding: '42px 22px' }}><div className="empty-icon"><ClipboardList size={23} /></div><h3>Your review lives here.</h3><p>Nothing is saved unless you approve it. Your photos stay private while we work.</p></div> : <>
            <div className="analysis-panel">
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
                <div><span className="eyebrow">First impression</span><h3>{fields.primaryColor} {fields.subtype || fields.category}</h3></div>
                <span className="observed-label"><CheckCircle2 size={12} /> Review before saving</span>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}><span className="observed-label"><Check size={12} /> Visually observed</span><span className="estimate-label"><CircleHelp size={12} /> Estimate, not certainty</span></div>
              <div className="detail-list">{detailItems.map(([label, value, key]) => <div className="detail-cell" key={key}><span>{label} · {prettySource(sourceFor(sources, key))}</span><strong>{value || 'Not clear from these photos'}</strong></div>)}</div>
              <div className="caution-note"><strong>What appearance can’t tell us:</strong> exact fabric composition, GSM, brand, price, or quality. Fabric appearance is only an estimate; check the garment label for composition.</div>
              {analysis.confidenceNote && <p className="small-help" style={{ marginTop: 12 }}>{analysis.confidenceNote}</p>}
              {analysis.labelPhotoSuggestion && <p className="small-help" style={{ marginTop: 10 }}>A photo of the care label could help verify the material.</p>}
            </div>
            <div className="chat-box">
              <div className="chat-head"><MessageCircle size={15} /> Talk it through</div>
              <div className="chat-history" aria-live="polite">{messages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}{chat.isPending && <div className="chat-bubble assistant">Thinking it through…</div>}</div>
              <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); void sendChat(); }}>
                <input className="chat-input" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="It’s actually cropped…" maxLength={2000} aria-label="Message about this garment" data-testid="input-garment-chat" />
                <button className="button" type="submit" disabled={!chatText.trim() || chat.isPending} aria-label="Send message" data-testid="button-send-chat"><Send size={15} /></button>
              </form>
            </div>
            <div className="approval-bar">
              <button className="button button-secondary" onClick={() => setEditing((value) => !value)} data-testid="button-edit-details"><ClipboardList size={14} /> {editing ? 'Hide details' : 'Edit details'}</button>
              <button className="button" onClick={() => saveItem(false)} disabled={save.isPending || duplicateOffer} data-testid="button-save-garment">{save.isPending ? <Loader2 className="spin-icon" size={14} /> : <Check size={14} />}{save.isPending ? 'Saving…' : 'Save to wardrobe'}</button>
              <button className="button button-quiet" onClick={() => { reset(); setToast('Draft discarded.'); }} disabled={save.isPending} data-testid="button-cancel-garment"><Trash2 size={14} /> Cancel</button>
            </div>
            {duplicateOffer && <div className="duplicate-offer" role="alert" data-testid="status-duplicate-confirmation">
              <div className="duplicate-copy"><strong>This looks like a photo already in your wardrobe.</strong><span>Nothing was added. If you intentionally want another copy, confirm below.</span></div>
              <div className="duplicate-actions">
                <button className="button" onClick={() => saveItem(true)} disabled={save.isPending} data-testid="button-confirm-duplicate">{save.isPending ? <Loader2 className="spin-icon" size={14} /> : <Check size={14} />}Save another copy</button>
                <button className="button button-quiet" onClick={() => setDuplicateOffer(false)} disabled={save.isPending} data-testid="button-decline-duplicate">Keep one copy</button>
              </div>
            </div>}
            {editing && <div className="analysis-panel" style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 17 }}>
              <div className="eyebrow">Edit before you approve</div>
              <p className="small-help" style={{ marginTop: 7 }}>Warm-tinted fields are guesses. Change or clear any detail. Leave unknown information blank.</p>
              <div className="form-row">
                <TextField label="Category *" value={fields.category} onChange={(v) => setField('category', v)} testId="input-category" />
                <TextField label="Item type" value={fields.subtype} onChange={(v) => setField('subtype', v)} testId="input-subtype" />
                <TextField label="Main color *" value={fields.primaryColor} onChange={(v) => setField('primaryColor', v)} testId="input-primary-color" />
                <TextField label="Other colors, comma separated" value={fields.secondaryColors} onChange={(v) => setField('secondaryColors', v)} testId="input-secondary-colors" />
                <TextField label="Pattern" value={fields.pattern} onChange={(v) => setField('pattern', v)} observed={sourceFor(sources, 'pattern') === 'visually_observed'} testId="input-pattern" />
                <TextField label="Silhouette" value={fields.silhouette} onChange={(v) => setField('silhouette', v)} testId="input-silhouette" />
                <TextField label="Fit impression" value={fields.fit} onChange={(v) => setField('fit', v)} estimate testId="input-fit" />
                <TextField label="Style" value={fields.style} onChange={(v) => setField('style', v)} estimate testId="input-style" />
              </div>
              <div className="field"><label htmlFor="design-details">Design details, comma separated</label><textarea id="design-details" value={fields.designDetails} onChange={(e) => setField('designDetails', e.target.value)} data-testid="input-design-details" /></div>
              <div className="field"><label htmlFor="fabric-estimate">Fabric appearance <span className="small-help">Estimate only — not composition</span></label><input className="estimate-field" id="fabric-estimate" value={fields.fabricEstimate} onChange={(e) => setField('fabricEstimate', e.target.value)} placeholder="For example: appears softly textured" data-testid="input-fabric-estimate" /></div>
              <div className="field"><label htmlFor="construction">Visible construction details</label><textarea id="construction" value={fields.constructionFeatures} onChange={(e) => setField('constructionFeatures', e.target.value)} data-testid="input-construction" /></div>
              <div className="form-row">
                <TextField label="Brand (only if you know it)" value={fields.brand} onChange={(v) => setField('brand', v)} testId="input-brand" />
                <TextField label="Size on label" value={fields.size} onChange={(v) => setField('size', v)} testId="input-size" />
                <TextField label="Occasions" value={fields.occasions} onChange={(v) => setField('occasions', v)} testId="input-occasions" />
                <TextField label="Seasons" value={fields.seasons} onChange={(v) => setField('seasons', v)} testId="input-seasons" />
                <TextField label="What you paid (optional)" value={fields.purchasePrice} onChange={(v) => setField('purchasePrice', v)} testId="input-purchase-price" />
                <TextField label="Purchase date" value={fields.purchaseDate} onChange={(v) => setField('purchaseDate', v)} testId="input-purchase-date" />
              </div>
              <div className="field"><label htmlFor="personal-notes">Personal notes</label><textarea id="personal-notes" value={fields.notes} maxLength={2000} onChange={(e) => setField('notes', e.target.value)} placeholder="A story, a memory, or how you like to wear it…" data-testid="input-personal-notes" /></div>
            </div>}
          </>}
        </section>
      </div>
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </main>
  );
}

function approvedAttributeSources(analysis: GarmentAnalysis, fields: DraftFields): AttributeSource[] {
  const values: Record<string, { value: string; original: string; fallback: AttributeSource['source'] }> = {
    category: { value: fields.category, original: analysis.category, fallback: 'visually_observed' },
    subtype: { value: fields.subtype, original: analysis.subtype, fallback: 'visually_observed' },
    primarycolor: { value: fields.primaryColor, original: analysis.primaryColor, fallback: 'visually_observed' },
    secondarycolors: { value: fields.secondaryColors, original: analysis.secondaryColors.join(', '), fallback: 'visually_observed' },
    pattern: { value: fields.pattern, original: analysis.pattern, fallback: 'visually_observed' },
    designdetails: { value: fields.designDetails, original: analysis.designDetails.join(', '), fallback: 'visually_observed' },
    silhouette: { value: fields.silhouette, original: analysis.silhouette, fallback: 'visually_observed' },
    fit: { value: fields.fit, original: analysis.fitEstimate, fallback: 'AI_estimate' },
    style: { value: fields.style, original: analysis.style, fallback: 'AI_estimate' },
    fabricestimate: { value: fields.fabricEstimate, original: analysis.fabricEstimate, fallback: 'AI_estimate' },
    constructionfeatures: { value: fields.constructionFeatures, original: analysis.constructionFeatures.join(', '), fallback: 'visually_observed' },
    occasions: { value: fields.occasions, original: analysis.occasions.join(', '), fallback: 'AI_estimate' },
    seasons: { value: fields.seasons, original: analysis.seasons.join(', '), fallback: 'AI_estimate' },
  };
  const included = new Set<string>();
  const result = analysis.attributeSources.map((entry) => {
    const key = normalizeAttribute(entry.attribute);
    const known = values[key];
    if (!known) return entry;
    included.add(key);
    const changedByUser = known.value.trim() !== known.original.trim();
    return { ...entry, value: known.value, source: changedByUser ? 'user_provided' as const : entry.source };
  });
  Object.entries(values).forEach(([key, entry]) => {
    if (!included.has(key) && entry.value.trim()) {
      result.push({
        attribute: ({
          primarycolor: 'primaryColor', fabricestimate: 'fabricEstimate', secondarycolors: 'secondaryColors',
          designdetails: 'designDetails', constructionfeatures: 'constructionFeatures',
        } as Record<string, string>)[key] ?? key,
        value: entry.value,
        source: entry.value.trim() !== entry.original.trim() ? 'user_provided' : entry.fallback,
      });
    }
  });
  if (fields.brand.trim()) result.push({ attribute: 'brand', value: fields.brand.trim(), source: 'user_provided' });
  if (fields.size.trim()) result.push({ attribute: 'size', value: fields.size.trim(), source: 'user_provided' });
  if (fields.purchasePrice.trim()) result.push({ attribute: 'purchasePrice', value: fields.purchasePrice.trim(), source: 'user_provided' });
  if (fields.purchaseDate.trim()) result.push({ attribute: 'purchaseDate', value: fields.purchaseDate.trim(), source: 'user_provided' });
  if (fields.notes.trim()) result.push({ attribute: 'notes', value: fields.notes.trim(), source: 'user_provided' });
  return result;
}

function TextField({ label, value, onChange, testId, estimate, observed }: { label: string; value: string; onChange: (value: string) => void; testId: string; estimate?: boolean; observed?: boolean }) {
  return <label className="field">{label}{estimate && <span className="small-help">Estimate</span>}{observed && <span className="small-help">Visible detail</span>}<input className={estimate ? 'estimate-field' : ''} value={value} onChange={(event) => onChange(event.target.value)} data-testid={testId} /></label>;
}

function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 · Not in this closet</span><h1>That page wandered off.</h1><p className="subcopy" style={{ margin: '0 auto 22px' }}>Head back to the pieces you’ve saved.</p><Link className="button" href="/">Back to wardrobe <ArrowRight size={14} /></Link></main>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function SignInPage() {
  return <main className="auth-page"><div className="auth-brand"><Link href="/" className="brand"><span className="brand-mark">d</span><span className="brand-word">DOHAY</span></Link><span className="eyebrow">Your wardrobe, thoughtfully kept</span></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-page"><div className="auth-brand"><Link href="/" className="brand"><span className="brand-mark">d</span><span className="brand-word">DOHAY</span></Link><span className="eyebrow">A closet with a little more clarity</span></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) cache.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function ClerkAppRoutes() {
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <div className="page-wrap"><div className="skeleton" style={{ height: 120, borderRadius: 18 }} /></div>;
  return <>
    <Header />
    <ClerkQueryClientCacheInvalidator />
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/">{user ? <WardrobePage /> : <LandingPage />}</Route>
        <Route path="/capture">{user ? <CapturePage /> : <LandingPage />}</Route>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  </>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        appearance={clerkAppearance}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        localization={{
          signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your wardrobe.' } },
          signUp: { start: { title: 'Make it yours', subtitle: 'Start a more thoughtful wardrobe.' } },
        }}
        routerPush={(to) => setLocation(stripBase(to))}
        routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      >
        <ClerkAppRoutes />
      </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');
  return <QueryClientProvider client={queryClient}>
    <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>
  </QueryClientProvider>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#385e52',
    colorForeground: '#293b34',
    colorMutedForeground: '#737c72',
    colorDanger: '#a5473f',
    colorBackground: '#fbf8f1',
    colorInput: '#f8f5ed',
    colorInputForeground: '#293b34',
    colorNeutral: '#d8d0c1',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: { width: '440px', maxWidth: '100%', backgroundColor: '#fbf8f1', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(59,69,59,.09)' },
    card: { backgroundColor: 'transparent', boxShadow: 'none', border: '0' },
    footer: { backgroundColor: 'transparent', boxShadow: 'none', border: '0' },
    headerTitle: { color: '#293b34', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 500 },
    headerSubtitle: { color: '#65736a' },
    socialButtonsBlockButtonText: { color: '#293b34', fontWeight: 600 },
    formFieldLabel: { color: '#293b34', fontWeight: 600 },
    footerActionLink: { color: '#385e52', fontWeight: 600 },
    footerActionText: { color: '#65736a' },
    dividerText: { color: '#65736a' },
    identityPreviewEditButton: { color: '#385e52' },
    formFieldSuccessText: { color: '#385e52' },
    alertText: { color: '#8e3d37' },
    logoBox: { borderRadius: '50%' },
    logoImage: { borderRadius: '50%' },
    socialButtonsBlockButton: { backgroundColor: '#fbf8f1', borderColor: '#d8d0c1', borderRadius: '999px', color: '#293b34' },
    formButtonPrimary: { backgroundColor: '#385e52', color: '#fbf8f1', borderRadius: '999px', boxShadow: 'none' },
    formFieldInput: { backgroundColor: '#f8f5ed', color: '#293b34', borderColor: '#d8d0c1', borderRadius: '10px' },
    footerAction: { color: '#65736a' },
    dividerLine: { backgroundColor: '#d8d0c1' },
    alert: { backgroundColor: '#f8eeeb', borderColor: '#ddb3aa', color: '#8e3d37' },
    otpCodeFieldInput: { backgroundColor: '#f8f5ed', color: '#293b34', borderColor: '#d8d0c1' },
    formFieldRow: { color: '#293b34' },
    main: { color: '#293b34' },
  },
};

export default App;
