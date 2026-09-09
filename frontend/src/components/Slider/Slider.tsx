import { useRef, type ReactNode } from 'react';
import './Slider.css';

interface SliderProps {
  children: ReactNode[];
}

export function Slider({ children }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: 1 | -1) => {
    const node = trackRef.current;
    if (!node) return;
    const cardWidth = node.firstElementChild?.clientWidth ?? 280;
    node.scrollBy({ left: direction * (cardWidth + 20), behavior: 'smooth' });
  };

  return (
    <div className="slider">
      <div className="slider__track" ref={trackRef}>
        {children.map((child, i) => (
          <div className="slider__item" key={i}>
            {child}
          </div>
        ))}
      </div>
      <button className="slider__arrow slider__arrow--left" aria-label="Назад" onClick={() => scrollByAmount(-1)}>
        <ArrowIcon flipped />
      </button>
      <button className="slider__arrow slider__arrow--right" aria-label="Вперёд" onClick={() => scrollByAmount(1)}>
        <ArrowIcon />
      </button>
    </div>
  );
}

function ArrowIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ transform: flipped ? 'rotate(180deg)' : undefined }}>
      <path d="M7 4l7 6-7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
