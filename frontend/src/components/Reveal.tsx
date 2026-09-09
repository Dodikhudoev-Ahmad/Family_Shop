import type { ReactNode } from 'react';
import { useInView } from '../hooks/useInView';

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ref, isVisible } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`fade-in-up ${isVisible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}
