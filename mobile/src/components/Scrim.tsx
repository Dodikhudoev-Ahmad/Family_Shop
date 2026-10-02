import { View } from 'react-native';

const STEPS = 12;

/**
 * A dark fade at the bottom of a photo (the website's `linear-gradient(transparent -> rgba(26,26,26,.55))`), drawn
 * with stacked strips of rising opacity so no gradient library is needed. `heightPercent` is how much of the photo it covers.
 */
export function Scrim({ heightPercent = 70, maxAlpha = 0.55 }: { heightPercent?: number; maxAlpha?: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${heightPercent}%` }}
    >
      {Array.from({ length: STEPS }).map((_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(26, 26, 26, ${(((i + 1) / STEPS) * maxAlpha).toFixed(3)})` }} />
      ))}
    </View>
  );
}
