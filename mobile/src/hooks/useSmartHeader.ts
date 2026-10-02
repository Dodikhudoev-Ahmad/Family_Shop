import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { INITIAL_HEADER_VISIBILITY, nextHeaderVisibility, type HeaderVisibility } from '../lib/headerVisibility';

const SLIDE_MS = 300; // the website's header slides for 0.3s

export interface SmartHeader {
  /** Bind to the header's Animated.View. */
  translateY: Animated.Value;
  /** Measured height of the whole header stack: content starts below it. */
  height: number;
  onLayout: (event: LayoutChangeEvent) => void;
  /** Bind to the screen's scrollable (scrollEventThrottle 16). */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** A menu anchored to the header is open: it must not slide away under the user's finger. */
  setOverlayOpen: (key: string, open: boolean) => void;
}

/** Hide-on-scroll-down / show-on-scroll-up, with the website's thresholds (see lib/headerVisibility). */
export function useSmartHeader(): SmartHeader {
  const translateY = useRef(new Animated.Value(0)).current;
  const visibility = useRef<HeaderVisibility>(INITIAL_HEADER_VISIBILITY);
  const overlays = useRef(new Set<string>());
  const heightRef = useRef(0);
  const reducedMotion = useRef(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        reducedMotion.current = reduced;
      })
      .catch(() => undefined);
  }, []);

  const slide = useCallback(
    (hidden: boolean) => {
      Animated.timing(translateY, {
        toValue: hidden ? -heightRef.current : 0,
        duration: reducedMotion.current ? 0 : SLIDE_MS,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    },
    [translateY]
  );

  const update = useCallback(
    (y: number) => {
      const next = nextHeaderVisibility(visibility.current, y, overlays.current.size > 0);
      const changed = next.hidden !== visibility.current.hidden;
      visibility.current = next;
      if (changed) slide(next.hidden);
    },
    [slide]
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => update(event.nativeEvent.contentOffset.y), [update]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const h = Math.round(event.nativeEvent.layout.height);
    heightRef.current = h;
    setHeight(h);
  }, []);

  const setOverlayOpen = useCallback(
    (key: string, open: boolean) => {
      if (open) {
        overlays.current.add(key);
        if (visibility.current.hidden) {
          visibility.current = { ...visibility.current, hidden: false };
          slide(false);
        }
      } else {
        overlays.current.delete(key);
      }
    },
    [slide]
  );

  return { translateY, height, onLayout, onScroll, setOverlayOpen };
}
