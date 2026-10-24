import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { useSceneTimer } from '@/lib/video';
import dohayLogo from '@assets/dohay-logo.svg';

const EASE = [0.22, 1, 0.36, 1] as const;

function LookSketch() {
  return (
    <svg className="look-sketch" viewBox="0 0 300 380" role="img" aria-label="Abstract outfit illustration">
      <ellipse cx="151" cy="350" rx="104" ry="12" fill="rgba(29,58,47,.12)" />
      <circle cx="151" cy="63" r="34" fill="#d09a85" />
      <path d="M118 61c1-33 64-43 70 1-14-11-23-25-26-34-8 20-21 31-44 33Z" fill="#3b6454" />
      <path d="M107 112 81 135l-29 84 25 9 36-65 5 96h70l8-96 38 65 25-10-31-84-32-24-45 25-44-23Z" fill="#f7f4ea" stroke="#3b6454" strokeWidth="4" strokeLinejoin="round" />
      <path d="m114 119 37 30 37-29-15-12-22 14-22-14-15 11Z" fill="#d09a85" />
      <path d="M116 259h72l-8 90h-30l-7-71-7 71h-29l9-90Z" fill="#3b6454" />
      <path d="M83 218 53 255l9 8 40-34M219 218l30 37-9 8-40-34" fill="none" stroke="#d09a85" strokeWidth="9" strokeLinecap="round" />
      <path d="M128 157h45M127 171h46M128 185h44" stroke="#d5cbb7" strokeWidth="3" strokeLinecap="round" />
      <path d="M138 108c5-5 21-5 27 0" fill="none" stroke="#385e52" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SceneBase({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={`film-scene ${className}`}
      initial={{ opacity: 0, clipPath: 'inset(0 0 0 4%)', scale: 1.018 }}
      animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)', scale: 1 }}
      exit={{ opacity: 0, scale: 1.035, transition: { duration: 0.38, ease: EASE } }}
      transition={{ duration: 0.58, ease: EASE }}
    >
      {children}
    </motion.section>
  );
}

export function Scene01() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 480, callback: () => setPhase(1) },
    { time: 1040, callback: () => setPhase(2) },
    { time: 2250, callback: () => setPhase(3) },
    { time: 4200, callback: () => setPhase(4) },
  ]);
  return (
    <SceneBase className="scene-one">
      <div className="scene-one-grid" />
      <span className="scene-index">01 / GET DRESSED</span>
      <div className="scene-one-copy">
        <p className="eyebrow">PERSONAL STYLING, REMEMBERED</p>
        <h1 className="scene-hero-question">
          <span>WHAT SHOULD I</span>
          <AnimatePresence mode="sync">
            <motion.em key={phase > 0 ? 'wear' : 'today'} initial={{ y: 34, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} transition={{ duration: 0.34, ease: EASE }}>
              {phase > 0 ? 'WEAR?' : 'WEAR?'}
            </motion.em>
          </AnimatePresence>
        </h1>
        <motion.p className="scene-one-subline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 12 }} transition={{ duration: 0.45 }}>
          A stylist who starts with your real closet.
        </motion.p>
        <motion.div className="fit-chip" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.85 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}>
          <span className="fit-chip-dot" /> Quick fit check
        </motion.div>
      </div>
      <motion.div className="portrait-aperture" initial={{ scale: 0.84, rotate: -4 }} animate={{ scale: phase >= 4 ? 1.18 : 1, rotate: phase >= 4 ? 0 : -1.5 }} transition={{ duration: phase >= 4 ? 0.82 : 0.78, ease: EASE }}>
        <div className="portrait-ring" />
        <LookSketch />
        <span className="portrait-stamp">HOW DO I LOOK?</span>
      </motion.div>
      <motion.div className="chat-peek" initial={{ opacity: 0, x: 24 }} animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : 24 }} transition={{ duration: 0.44, ease: EASE }}>
        <span className="mini-avatar">D</span>
        <span>How does my outfit look?</span>
      </motion.div>
      <div className="corner-caption">A QUICK, HONEST FIT CHECK</div>
    </SceneBase>
  );
}

export function Scene02() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 620, callback: () => setPhase(1) },
    { time: 1320, callback: () => setPhase(2) },
    { time: 2220, callback: () => setPhase(3) },
    { time: 4520, callback: () => setPhase(4) },
  ]);
  return (
    <SceneBase className="scene-two">
      <div className="scene-two-rail">
        <span className="eyebrow">THE CONVERSATION</span>
        <h2>Tell it about <em>today.</em></h2>
        <div className="rail-rule" />
        <p>Work, dinner, a long walk. Add context only when it helps.</p>
        <span className="scene-index">02 / ASK</span>
      </div>
      <div className="chat-window">
        <div className="chat-window-top"><span className="mini-avatar">D</span><div><b>DOHAY</b><small>Your personal stylist</small></div><span className="online-mark" /></div>
        <motion.div className="chat-bubble user-bubble" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.18, duration: 0.48, ease: EASE }}>
          Dinner with friends tonight. What should I wear?
        </motion.div>
        <motion.div className="chat-bubble assistant-bubble" initial={{ opacity: 0, y: 16 }} animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 16 }} transition={{ duration: 0.5, ease: EASE }}>
          Let’s build around the pieces you already own.
        </motion.div>
        <motion.div className="optional-context" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.92 }} transition={{ duration: 0.42, ease: EASE }}>
          <span className="context-caption">OPTIONAL CONTEXT</span>
          <span className="context-pill">Dinner</span><span className="context-pill clay">Smart casual</span>
        </motion.div>
        <div className="chat-composer-art">
          <span className="composer-copy">Dictate or type</span>
          <motion.span className="voice-mark" animate={{ scaleY: phase >= 3 ? [0.6, 1, 0.7] : 0.65 }} transition={{ duration: 0.56, repeat: phase >= 3 ? 1 : 0 }}>
            <i /><i /><i /><i /><i />
          </motion.span>
        </div>
        <span className="chat-window-foot">YOUR WORDS, YOUR CONTEXT</span>
      </div>
      <motion.div className="message-orbit" animate={{ rotate: phase >= 4 ? 17 : 0, scale: phase >= 4 ? 1.26 : 1 }} transition={{ duration: 0.78, ease: EASE }} />
      <div className="context-footnote">OPTIONAL OCCASION + DRESS CODE</div>
    </SceneBase>
  );
}

const pieces = [
  { name: 'Jacket', tone: 'jacket', delay: 0.06 },
  { name: 'Shirt', tone: 'shirt', delay: 0.28 },
  { name: 'Bag', tone: 'bag', delay: 0.5 },
];

function GarmentShape({ tone }: { tone: string }) {
  if (tone === 'jacket') return <svg viewBox="0 0 150 180" aria-hidden="true"><path d="m45 24 30 15 30-15 25 23 13 102H7L20 47l25-23Z" fill="#3b6454" /><path d="m45 24 30 32 30-32M75 56v93M57 75l10 5m26-5-10 5" fill="none" stroke="#f7f4ea" strokeWidth="4" strokeLinecap="round" /><path d="M38 93h19v29H38m55-29h19v29H93" fill="none" stroke="#d09a85" strokeWidth="4" /></svg>;
  if (tone === 'shirt') return <svg viewBox="0 0 150 180" aria-hidden="true"><path d="m49 22 26 15 26-15 36 22-18 33-16-9v89H47V68l-16 9-18-33 36-22Z" fill="#d09a85" /><path d="m49 22 26 31 26-31M75 53v104m-9-89 9 6 9-6" fill="none" stroke="#f7f4ea" strokeWidth="4" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 150 180" aria-hidden="true"><path d="M27 62h96l-9 94H36l-9-94Z" fill="#b9ad91" /><path d="M49 65V52a26 26 0 0 1 52 0v13" fill="none" stroke="#3b6454" strokeWidth="9" strokeLinecap="round" /><path d="M44 92h62" stroke="#f7f4ea" strokeWidth="4" /></svg>;
}

export function Scene03() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 710, callback: () => setPhase(1) },
    { time: 1500, callback: () => setPhase(2) },
    { time: 3300, callback: () => setPhase(3) },
    { time: 4960, callback: () => setPhase(4) },
  ]);
  return (
    <SceneBase className="scene-three">
      <div className="wardrobe-kicker"><span className="eyebrow">YOUR DIGITAL WARDROBE</span><span className="scene-index">03 / REMEMBER</span></div>
      <h2 className="wardrobe-title">{phase >= 1 ? 'PIECES, REMEMBERED.' : 'ONE PHOTO.'}</h2>
      <p className="wardrobe-caption">{phase >= 3 ? 'Each visible garment and accessory saves separately.' : 'Capture by upload or camera.'}</p>
      <motion.div className="source-photo-card" initial={{ rotate: -3, scale: 0.94 }} animate={{ rotate: phase >= 4 ? -8 : -2, scale: phase >= 4 ? 0.85 : 1 }} transition={{ duration: 0.58, ease: EASE }}>
        <div className="source-photo-top"><span>OUTFIT PHOTO</span><span className="photo-dot" /></div>
        <LookSketch />
        <div className="photo-bottom">Original upload remains yours</div>
        <svg className="photo-traces" viewBox="0 0 320 340" aria-hidden="true"><path d="M113 113 93 160M196 113l20 47M117 213h82M145 243v53M175 243v53" /></svg>
      </motion.div>
      <div className="piece-flow">
        {pieces.map((piece, index) => (
          <motion.article key={piece.name} className={`piece-card ${piece.tone}`} initial={{ opacity: 0, x: 38, y: 18, rotate: 7 }} animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? (phase >= 4 ? -index * 26 : 0) : 38, y: phase >= 2 ? index * 8 : 18, rotate: phase >= 2 ? (index - 1) * 2.5 : 7 }} transition={{ delay: piece.delay, duration: 0.56, ease: EASE }}>
            <div className="piece-label">SAVED PIECE 0{index + 1}</div>
            <GarmentShape tone={piece.tone} />
            <strong>{piece.name}</strong>
            <span>AI details · editable</span>
          </motion.article>
        ))}
      </div>
      <div className="wardrobe-divider" />
      <motion.div className="capture-stamp" animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.8 }} transition={{ duration: 0.38 }}>UPLOAD OR CAMERA</motion.div>
    </SceneBase>
  );
}

export function Scene04() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 820, callback: () => setPhase(1) },
    { time: 1840, callback: () => setPhase(2) },
    { time: 2950, callback: () => setPhase(3) },
    { time: 4550, callback: () => setPhase(4) },
  ]);
  return (
    <SceneBase className="scene-four">
      <div className="detail-headline">
        <span className="eyebrow">A LITTLE HELP, NEVER A LOCK</span>
        <h2>AI suggests.<br /><em>You decide.</em></h2>
      </div>
      <motion.div className="detail-garment-card" initial={{ y: 28, rotate: 2 }} animate={{ y: phase >= 4 ? -20 : 0, rotate: 0 }} transition={{ duration: 0.52, ease: EASE }}>
        <div className="detail-garment-art"><GarmentShape tone="jacket" /><span className="detail-seam" /></div>
        <div className="detail-list">
          <span className="detail-caption">SUGGESTED DETAILS</span>
          <strong>Linen blazer</strong>
          <motion.span key={phase >= 2 ? 'forest' : 'olive'} className="detail-attribute" initial={{ opacity: 0.2, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.38 }}>{phase >= 2 ? 'Forest green' : 'Olive'} <i className="editable-dot" /></motion.span>
          <span className="detail-attribute">Smart casual</span>
          <small>AI-estimated details · editable</small>
          <motion.span className="edit-caption" animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : 10 }}>You can change any detail</motion.span>
        </div>
      </motion.div>
      <div className="simulation-pair">
        <motion.div className="simulation-panel original-panel" initial={{ x: -20, opacity: 0 }} animate={{ x: phase >= 3 ? 0 : -20, opacity: phase >= 3 ? 1 : 0 }} transition={{ duration: 0.45 }}>
          <div className="sim-art original-art"><GarmentShape tone="jacket" /></div>
          <span>ORIGINAL UPLOAD</span>
        </motion.div>
        <motion.div className="simulation-panel ai-panel" initial={{ x: 20, opacity: 0 }} animate={{ x: phase >= 3 ? 0 : 20, opacity: phase >= 3 ? 1 : 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
          <div className="sim-art styled-art"><LookSketch /></div>
          <span className="simulation-label">AI STYLING SIMULATION</span>
        </motion.div>
      </div>
      <motion.p className="simulation-caveat" animate={{ opacity: phase >= 3 ? 1 : 0 }}>An idea to explore—not a fit guarantee.</motion.p>
      <motion.div className="color-bridge" animate={{ scale: phase >= 4 ? 1.18 : 0.8, opacity: phase >= 4 ? 1 : 0 }}><i /><i /><i /></motion.div>
    </SceneBase>
  );
}

export function Scene05() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 580, callback: () => setPhase(1) },
    { time: 1430, callback: () => setPhase(2) },
    { time: 2760, callback: () => setPhase(3) },
  ]);
  return (
    <SceneBase className="scene-five">
      <div className="profile-topline"><span className="eyebrow">THE DETAILS THAT MAKE IT YOURS</span><span className="scene-index">05 / REMEMBER YOU</span></div>
      <h2 className="profile-title">Made more <em>you.</em></h2>
      <div className="profile-triptych">
        <motion.div className="profile-note-sheet" initial={{ x: -28, rotate: -3, opacity: 0 }} animate={{ x: 0, rotate: -2, opacity: 1 }} transition={{ duration: 0.52, ease: EASE }}>
          <span className="sheet-label">YOUR STYLE NOTES</span>
          <strong>Relaxed<br />tailoring</strong>
          <span className="profile-chip">Vintage</span><span className="profile-chip clay">Comfort first</span>
          <div className="sheet-rule" />
          <small>A hint, not a rule.</small>
        </motion.div>
        <div className="profile-palette">
          <span className="sheet-label">COLORS YOU REACH FOR</span>
          <div className="palette-orbit">
            {['#3b6454', '#d09a85', '#3e4b48', '#c6b99c', '#87958a'].map((color, index) => <motion.i key={color} style={{ background: color }} initial={{ scale: 0 }} animate={{ scale: phase >= 1 ? 1 : 0 }} transition={{ delay: index * 0.09, type: 'spring', stiffness: 250, damping: 18 }} />)}
          </div>
          <span className="palette-names">MOSS · CLAY · INK</span>
        </div>
        <motion.div className="plans-abstract" initial={{ x: 28, rotate: 3, opacity: 0 }} animate={{ x: 0, rotate: 1, opacity: 1 }} transition={{ duration: 0.52, ease: EASE }}>
          <span className="sheet-label">PLANS</span>
          <b>Free</b><b>Plus</b><b>Pro</b>
          <small>Options for your routine</small>
        </motion.div>
      </div>
      <motion.p className="profile-bottom-note" animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 12 }}>Preferences are yours to change.</motion.p>
      <motion.div className="owner-keyhole" animate={{ opacity: phase >= 3 ? 1 : 0, scale: phase >= 3 ? 1 : 0.7 }} transition={{ duration: 0.45 }}>
        <div className="keyhole-symbol"><span /></div>
        <span>OWNER-ONLY WORKSPACE</span>
      </motion.div>
    </SceneBase>
  );
}

export function Scene06() {
  const [phase, setPhase] = useState(0);
  useSceneTimer([
    { time: 820, callback: () => setPhase(1) },
    { time: 2790, callback: () => setPhase(2) },
    { time: 3370, callback: () => setPhase(3) },
    { time: 4020, callback: () => setPhase(4) },
  ]);
  return (
    <SceneBase className="scene-six">
      <div className="owner-dashboard">
        <div className="owner-dashboard-top"><span className="owner-mark">D</span><span>DOHAY / Owner workspace</span><span className="owner-verified">VERIFIED OWNER</span></div>
        <div className="owner-dashboard-title">A clear view of your accounts.</div>
        <div className="owner-dashboard-cards">
          {['Accounts', 'Plan access', 'Payment review'].map((item, index) => <motion.div key={item} className="owner-summary-tile" initial={{ y: 18, opacity: 0 }} animate={{ y: phase >= 1 ? 0 : 18, opacity: phase >= 1 ? 1 : 0 }} transition={{ delay: index * 0.12, duration: 0.42 }}><span>{item}</span><i className={`owner-tile-symbol symbol-${index}`} /></motion.div>)}
        </div>
        <div className="owner-private-note">Available only to the verified owner.</div>
      </div>
      <div className="end-card">
        <motion.div className="end-copy" initial={{ opacity: 0, y: 14 }} animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 14 }} transition={{ duration: 0.42 }}>
          <span className="eyebrow">PERSONAL STYLING, REMEMBERED</span>
          <h2>YOUR CLOSET.<br /><em>YOUR POINT OF VIEW.</em></h2>
        </motion.div>
        <motion.div className="brand-lockup-art" initial={{ scale: 0.78, opacity: 0 }} animate={{ scale: phase >= 3 ? 1 : 0.78, opacity: phase >= 3 ? 1 : 0 }} transition={{ type: 'spring', stiffness: 230, damping: 22 }}>
          <img src={dohayLogo} alt="DOHAY" />
          <span>DOHAY</span>
          <small>Personal styling, remembered</small>
        </motion.div>
        <motion.div className="loop-medallion" animate={{ scale: phase >= 4 ? 3.4 : 0, opacity: phase >= 4 ? 1 : 0 }} transition={{ duration: 0.58, ease: EASE }} />
      </div>
      <span className="scene-index">06 / DOHAY</span>
    </SceneBase>
  );
}
