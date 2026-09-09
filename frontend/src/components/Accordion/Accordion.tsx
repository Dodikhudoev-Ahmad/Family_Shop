import { useRef, useState, type ReactNode } from 'react';
import './Accordion.css';

interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`accordion ${isOpen ? 'is-open' : ''}`}>
      <button className="accordion__header" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen}>
        <span>{title}</span>
        <span className="accordion__icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div
        className="accordion__content"
        style={{ maxHeight: isOpen ? contentRef.current?.scrollHeight : 0 }}
      >
        <div ref={contentRef} className="accordion__inner">
          {children}
        </div>
      </div>
    </div>
  );
}
