import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/** A softly pulsing placeholder block (standing still when the OS asks for reduced motion). */
export function SkeletonBlock({ width = '100%', height, style }: { width?: DimensionValue; height: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active || reduced) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
          ])
        );
        loop.start();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      loop?.stop();
    };
  }, [opacity]);

  return <Animated.View style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.bgSecondary, opacity }, style]} />;
}

export function ProductCardSkeleton({ width }: { width?: number }) {
  return (
    <View style={[{ gap: spacing.sm }, width !== undefined && { width }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBlock height={0} style={{ aspectRatio: 3 / 4, height: undefined, borderRadius: radius.md }} />
      <SkeletonBlock height={12} width="40%" />
      <SkeletonBlock height={14} width="90%" />
      <SkeletonBlock height={16} width="55%" />
    </View>
  );
}
