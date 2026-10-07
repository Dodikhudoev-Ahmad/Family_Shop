import type { ReactNode } from 'react';
import './HomeBand.css';

/** plain = page background, alt = secondary background (alternates), dark = the "Хиты" band of variant B. */
export type BandTone = 'plain' | 'alt' | 'dark';

/** Tone of the n-th band of the home body: plain/alt alternate, starting with alt right under the hero. */
export const alternatingTone = (index: number): BandTone => (index % 2 === 0 ? 'alt' : 'plain');

interface HomeBandProps {
  tone: BandTone;
  children: ReactNode;
  className?: string;
  'aria-labelledby'?: string;
}

/** A full-width coloured strip of the home page with the usual centred container inside. */
export function HomeBand({ tone, children, className = '', 'aria-labelledby': labelledBy }: HomeBandProps) {
  return (
    <section className={`home-band ${className}`} data-tone={tone} aria-labelledby={labelledBy}>
      <div className="container">{children}</div>
    </section>
  );
}
