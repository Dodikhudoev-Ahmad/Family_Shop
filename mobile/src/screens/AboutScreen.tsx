import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { Button, Screen } from '../components/ui';
import { useCategories } from '../state/CategoriesContext';
import { useProducts } from '../state/ProductsContext';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const VALUES = [
  { id: 'quality', icon: 'star-outline' },
  { id: 'family', icon: 'people-outline' },
  { id: 'minimalism', icon: 'shapes-outline' },
  { id: 'care', icon: 'heart-outline' },
] as const;

const styles = (c: ColorTokens) => ({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { color: c.accent, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 1 },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl },
  text: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 24 },
  h2: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  value: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.bgSecondary },
  valueTitle: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.lg },
  stats: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  stat: { flexGrow: 1, flexBasis: '45%' as const, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  statValue: { color: c.accent, fontFamily: fonts.headingBold, fontSize: fontSizes.xxl },
  statLabel: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
});

/** "О нас", with the same copy as the website's About page. */
export function AboutScreen() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { products, isLoading: productsLoading } = useProducts();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const stats = [
    { value: productsLoading ? '—' : `${products.length}+`, label: t('about.statProducts') },
    { value: categoriesLoading ? '—' : String(categories.length), label: t('about.statCategories') },
    { value: '3', label: t('about.statDirections') },
    { value: 'KZ', label: t('about.statDelivery') },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content}>
        <View style={{ gap: spacing.sm }}>
          <Text style={s.eyebrow}>{t('about.eyebrow')}</Text>
          <Text style={s.title} accessibilityRole="header">
            {t('about.heroTitle')}
          </Text>
          <Text style={s.text}>{t('about.heroText')}</Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={s.h2} accessibilityRole="header">
            {t('about.principles')}
          </Text>
          {VALUES.map((v) => (
            <View key={v.id} style={s.value}>
              <Ionicons name={v.icon} size={24} color={colors.accent} />
              <Text style={s.valueTitle}>{t(`about.${v.id}Title`)}</Text>
              <Text style={s.text}>{t(`about.${v.id}Text`)}</Text>
            </View>
          ))}
        </View>

        <View style={s.stats}>
          {stats.map((stat) => (
            <View key={stat.label} style={s.stat}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={s.h2} accessibilityRole="header">
            {t('about.ctaTitle')}
          </Text>
          <Text style={s.text}>{t('about.ctaText')}</Text>
          <Button label={t('about.ctaButton')} onPress={() => navigation.navigate('CatalogTab')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
