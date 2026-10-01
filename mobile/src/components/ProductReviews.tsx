import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchProductReviews } from '../lib/api/endpoints';
import type { ReviewDto } from '../lib/api/types';
import { formatReviewDate } from '../lib/catalog/homeSections';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { StarRating } from './StarRating';
import { Button, StateMessage } from './ui';

const PAGE_SIZE = 5;

const styles = (c: ColorTokens) => ({
  wrap: { gap: spacing.md },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  summary: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  summaryText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  review: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.bgSecondary },
  head: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.sm },
  author: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, flexShrink: 1 },
  date: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  comment: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 21 },
  empty: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md },
});

interface ProductReviewsProps {
  productId: number;
  averageRating: number;
  reviewCount: number;
}

/** Reviews as a list, newest first, five at a time with "Показать ещё" - nothing is silently left out. */
export function ProductReviews({ productId, averageRating, reviewCount }: ProductReviewsProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const [items, setItems] = useState<ReviewDto[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const mine = generation.current;
      setLoading(true);
      setFailed(false);
      try {
        const result = await fetchProductReviews(productId, nextPage, PAGE_SIZE);
        if (mine !== generation.current) return;
        setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items.filter((r) => !prev.some((x) => x.id === r.id))]));
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch {
        if (mine === generation.current) setFailed(true);
      } finally {
        if (mine === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [productId]
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setItems([]);
    setPage(0);
    setHasMore(false);
    void load(1);
    return () => {
      generation.current += 1;
    };
  }, [load]);

  return (
    <View style={s.wrap}>
      <Text style={s.title} accessibilityRole="header">
        {t('reviews.title')}
      </Text>
      {reviewCount > 0 ? (
        <View style={s.summary}>
          <StarRating value={averageRating} size={16} />
          <Text style={s.summaryText}>
            {averageRating.toFixed(1)} · {t('reviews.count', { count: reviewCount })}
          </Text>
        </View>
      ) : null}

      {items.map((review) => (
        <View key={review.id} style={s.review}>
          <View style={s.head}>
            <Text style={s.author} numberOfLines={1}>
              {review.userName}
            </Text>
            <Text style={s.date}>{formatReviewDate(review.createdAt)}</Text>
          </View>
          <StarRating value={review.rating} size={13} />
          {review.comment ? <Text style={s.comment}>{review.comment}</Text> : null}
        </View>
      ))}

      {loading && items.length === 0 ? <StateMessage loading message={t('common.loading')} /> : null}
      {!loading && !failed && items.length === 0 ? <Text style={s.empty}>{t('mobile.reviewsEmpty')}</Text> : null}
      {failed ? <StateMessage message={t('mobile.reviewsError')} actionLabel={t('mobile.retry')} onAction={() => void load(page + 1)} /> : null}
      {hasMore && !failed ? <Button variant="secondary" label={t('reviews.loadMore')} loading={loading} onPress={() => void load(page + 1)} /> : null}
    </View>
  );
}
