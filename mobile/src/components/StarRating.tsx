import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
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
