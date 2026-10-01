import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Logo, Screen, StateMessage } from '../components/ui';
import { useLabels } from '../i18n/labels';
import type { CatalogStackParamList } from '../navigation/types';
import { useCategories } from '../state/CategoriesContext';
import { fontSizes, fonts, MIN_TOUCH_TARGET, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xxl, marginTop: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: {
    minHeight: MIN_TOUCH_TARGET + 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  rowPressed: { backgroundColor: c.bgSecondary },
  rowText: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.lg },
  chevron: { color: c.accent, fontFamily: fonts.body, fontSize: fontSizes.xl },
});

/** First screen: every store category, loaded from the real API. Tapping one opens its products. */
export function HomeScreen({ navigation }: NativeStackScreenProps<CatalogStackParamList, 'Home'>) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { categories, isLoading, error, reload } = useCategories();

  const header = (
    <View style={s.header}>
      <Logo />
      <Text style={s.title}>{t('header.categories')}</Text>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={categories}
        keyExtractor={(category) => category.id}
        ListHeaderComponent={header}
        contentContainerStyle={s.list}
        refreshing={isLoading && categories.length > 0}
        onRefresh={() => void reload()}
        ListEmptyComponent={
          isLoading ? (
            <StateMessage loading message={t('common.loading')} />
          ) : error ? (
            <StateMessage message={t('mobile.categoriesError')} actionLabel={t('mobile.retry')} onAction={() => void reload()} />
          ) : (
            <StateMessage message={t('mobile.categoriesEmpty')} />
          )
        }
        renderItem={({ item }) => {
          const name = categoryName(item);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={name}
              onPress={() => navigation.navigate('Category', { categoryId: Number(item.id), slug: item.slug, name })}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            >
              <Text style={s.rowText}>{name}</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
