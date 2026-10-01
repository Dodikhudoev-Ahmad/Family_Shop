import { useEffect, useState } from 'react';
import { ImageBackground, Linking, Pressable, ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchActivePromoBanners } from '../lib/api/endpoints';
import type { PromoBannerDto } from '../lib/api/types';
import { isHttpUrl, isInternalPath } from '../lib/catalog/safeLink';
import { fontSizes, fonts, MIN_TOUCH_TARGET, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const styles = (c: ColorTokens) => ({
  card: { borderRadius: radius.lg, overflow: 'hidden' as const, minHeight: 170, backgroundColor: c.accent, justifyContent: 'flex-end' as const },
  shade: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26, 26, 26, 0.38)' },
  content: { padding: spacing.md, gap: spacing.xs },
  title: { color: '#FFFFFF', fontFamily: fonts.heading, fontSize: fontSizes.xl },
  subtitle: { color: '#FFFFFF', fontFamily: fonts.body, fontSize: fontSizes.sm },
  cta: { alignSelf: 'flex-start' as const, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' as const, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: '#FFFFFF', marginTop: spacing.xs },
  ctaText: { color: '#1A1A1A', fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm },
  dots: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6, paddingTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border },
  dotActive: { backgroundColor: c.accent, width: 16 },
});

/** Where a banner's admin-supplied button leads. Anything that is not a plain in-app path or http(s) is dropped. */
export type BannerAction = { kind: 'internal'; path: string } | { kind: 'external'; url: string } | null;

export function bannerAction(banner: Pick<PromoBannerDto, 'buttonText' | 'buttonLink'>): BannerAction {
  if (!banner.buttonText || !banner.buttonLink) return null;
  if (isInternalPath(banner.buttonLink)) return { kind: 'internal', path: banner.buttonLink };
  if (isHttpUrl(banner.buttonLink)) return { kind: 'external', url: banner.buttonLink };
  return null;
}

/** Active promo banners for the home screen (placement 0), as a swipeable strip. Renders nothing without any. */
export function PromoBanner({ onInternalLink }: { onInternalLink: (path: string) => void }) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [banners, setBanners] = useState<PromoBannerDto[]>([]);
  const [index, setIndex] = useState(0);
  const cardWidth = width - spacing.md * 2;

  useEffect(() => {
    let cancelled = false;
    fetchActivePromoBanners(0)
      .then((result) => {
        if (!cancelled) setBanners(result);
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (banners.length === 0) return null;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.sm)));

  return (
    <View>
      <ScrollView
        horizontal
        snapToInterval={cardWidth + spacing.sm}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
        onMomentumScrollEnd={onScrollEnd}
      >
        {banners.map((banner) => {
          const action = bannerAction(banner);
          const body = (
            <>
              <View style={s.shade} />
              <View style={s.content}>
                <Text style={s.title}>{banner.title}</Text>
                {banner.subtitle ? <Text style={s.subtitle}>{banner.subtitle}</Text> : null}
                {action ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={banner.buttonText ?? undefined}
                    style={s.cta}
                    onPress={() => (action.kind === 'internal' ? onInternalLink(action.path) : void Linking.openURL(action.url))}
                  >
                    <Text style={s.ctaText}>{banner.buttonText}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          );
          return banner.imageUrl ? (
            <ImageBackground key={banner.id} source={{ uri: banner.imageUrl }} style={[s.card, { width: cardWidth }]} resizeMode="cover" accessibilityIgnoresInvertColors>
              {body}
            </ImageBackground>
          ) : (
            <View key={banner.id} style={[s.card, { width: cardWidth }]}>
              {body}
            </View>
          );
        })}
      </ScrollView>
      {banners.length > 1 ? (
        <View style={s.dots} accessibilityLabel={t('banners.others')}>
          {banners.map((b, i) => (
            <View key={b.id} style={[s.dot, i === index && s.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
