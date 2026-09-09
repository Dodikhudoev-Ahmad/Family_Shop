import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import './FadeImage.css';

type FadeImageProps = ImgHTMLAttributes<HTMLImageElement>;

// Fades images in on load instead of popping in over the skeleton background,
// and treats already-cached images (img.complete) as loaded immediately so
// warm-cache navigations don't flash a placeholder.
export function FadeImage({ className = '', src, onLoad, ...rest }: FadeImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={src}
      className={`fade-image ${loaded ? 'is-loaded' : ''} ${className}`.trim()}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      {...rest}
    />
  );
}
