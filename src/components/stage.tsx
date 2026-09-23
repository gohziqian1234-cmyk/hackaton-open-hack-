'use client';
import dynamic from 'next/dynamic';
import { Component, useEffect, useState } from 'react';
import { BoxArt, KinArt } from './art';
const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="scene-loading skeleton" aria-hidden="true" />,
});
class Boundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function Stage({
  mode = 'hero',
  opened = false,
  character = 'eclipse',
}: {
  mode?: 'hero' | 'box' | 'reveal';
  opened?: boolean;
  character?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null),
    [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    const frame = requestAnimationFrame(() => {
      update();
    });
    media.addEventListener('change', update);
    const probe = requestAnimationFrame(() => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2');
        setSupported(!!context);
        context?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        setSupported(false);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(probe);
      media.removeEventListener('change', update);
    };
  }, []);
  const fallback =
    mode === 'hero' ? (
      <div className="fallback-art hero-fallback">
        <BoxArt className="fallback-box" />
        <KinArt id={character} className="fallback-kin" />
      </div>
    ) : (
      <div className="fallback-art">{opened ? <KinArt id={character} /> : <BoxArt />}</div>
    );
  return (
    <div
      className={'product-stage ' + mode}
      role="group"
      aria-label="Interactive 3D Astral Kin collectible"
    >
      {supported === null ? (
        <div className="scene-loading skeleton" aria-hidden="true" />
      ) : supported ? (
        <Boundary fallback={fallback}>
          <Scene
            mode={mode}
            opened={opened}
            character={character}
            reduced={reduced}
            onFailure={() => setSupported(false)}
          />
        </Boundary>
      ) : (
        fallback
      )}
    </div>
  );
}
