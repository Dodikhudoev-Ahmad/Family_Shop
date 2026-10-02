import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipSquare: { borderRadius: radius.sm, minWidth: MIN_TOUCH_TARGET, paddingHorizontal: spacing.sm },
  chipActive: { backgroundColor: c.accent, borderColor: c.accent },
  text: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  textActive: { color: c.white },
  wrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  scroll: { gap: spacing.sm, paddingHorizontal: spacing.md },
});

/** `square` is the website's size chip (small radius); the default is the round filter chip. */
export function Chip({ label, selected, onPress, square = false }: { label: string; selected: boolean; onPress: () => void; square?: boolean }) {
  const s = useThemedStyles(styles);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[s.chip, square && s.chipSquare, selected && s.chipActive]}>
      <Text numberOfLines={1} style={[s.text, selected && s.textActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipOption {
  /** null = "all" */
  value: string | null;
  label: string;
}

/** Wrapping chips, for filter sheets. Tapping the selected size/type again is up to the caller. */
export function ChipGroup({ options, value, onChange, style }: { options: ChipOption[]; value: string | null; onChange: (value: string | null) => void; style?: StyleProp<ViewStyle> }) {
  const s = useThemedStyles(styles);
  return (
    <View style={[s.wrap, style]}>
      {options.map((o) => (
        <Chip key={o.value ?? 'all'} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** One horizontally scrolling line of chips (quick type filter under the catalogue title). */
export function ChipStrip({ options, value, onChange }: { options: ChipOption[]; value: string | null; onChange: (value: string | null) => void }) {
  const s = useThemedStyles(styles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
      {options.map((o) => (
        <Chip key={o.value ?? 'all'} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}
