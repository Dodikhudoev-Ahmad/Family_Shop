import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontSizes, fonts } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  count: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs, marginLeft: 4 },
});

/** Five stars filled to the nearest half, with an optional "(12)" count. */
export function StarRating({ value, count, size = 12 }: { value: number; count?: number; size?: number }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const rounded = Math.round(value * 2) / 2;
  return (
    <View style={s.row} accessible accessibilityLabel={`${value.toFixed(1)} / 5${count !== undefined ? `, ${t('reviews.count', { count })}` : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={rounded >= i ? 'star' : rounded >= i - 0.5 ? 'star-half' : 'star-outline'} size={size} color={colors.accent} />
      ))}
      {count !== undefined ? <Text style={s.count}>({count})</Text> : null}
    </View>
  );
}

const inputStyles = (c: ColorTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const },
  star: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
});

/** Tap-to-rate stars (1..5) for the review form: each star is its own 44pt target. */
export function RatingInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const s = useThemedStyles(inputStyles);
  const { colors } = useTheme();
  return (
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === i }}
          accessibilityLabel={`${i} / 5`}
          onPress={() => onChange(i)}
          style={s.star}
        >
          <Ionicons name={value >= i ? 'star' : 'star-outline'} size={30} color={colors.accent} />
        </Pressable>
      ))}
    </View>
  );
}
