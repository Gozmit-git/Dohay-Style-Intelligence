import { useEffect, useRef } from 'react';
import {
  VideoCanvas,
  VideoPausedContext,
  useVideoPlayer,
  type VideoAspectRatio,
} from '@/lib/video';
import { AnimatePresence } from 'framer-motion';

import { Scene01, Scene02, Scene03, Scene04, Scene05, Scene06 } from './DohayScenes';
import './video-film.css';

export const SCENE_DURATIONS = {
  fitCheck: 5100,
  conversation: 5850,
  wardrobe: 5850,
  aiDetails: 5850,
  preferences: 3650,
  ownerClose: 5700,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
const SCENE_COMPONENTS = {
  fitCheck: Scene01,
  conversation: Scene02,
  wardrobe: Scene03,
  aiDetails: Scene04,
  preferences: Scene05,
  ownerClose: Scene06,
};
const SCENE_START_SEC: Record<string, number> = (() => {
  const starts: Record<string, number> = {};
  let total = 0;
  for (const [scene, duration] of Object.entries(SCENE_DURATIONS)) {
    starts[scene] = total / 1000;
    total += duration;
  }
  return starts;
})();

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const Scene = SCENE_COMPONENTS[baseSceneKey as keyof typeof SCENE_COMPONENTS];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.48;
    if (paused) {
      audio.pause();
      return;
    }
    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const target = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted, paused]);

  return (
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className="dohay-video" style={{ backgroundColor: 'var(--color-bg-light)' }}>
      <VideoPausedContext.Provider value={paused}>
        <div className="video-stage">
          <AnimatePresence mode="sync">
            {Scene && <Scene key={currentSceneKey} />}
          </AnimatePresence>
          <div className="film-grain" />
          <div className="film-progress-marker" style={{ '--scene-index': currentScene } as React.CSSProperties} />
        </div>
      </VideoPausedContext.Provider>
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </VideoCanvas>
  );
}
