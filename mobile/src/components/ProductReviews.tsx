import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFieldError } from '../i18n/labels';
import { createReview, deleteMyReview, fetchMyReview, fetchProductReviews, fetchReviewSummary } from '../lib/api/endpoints';
import type { ReviewDto, ReviewSortBy, ReviewSummaryDto } from '../lib/api/types';
import { formatReviewDate } from '../lib/catalog/homeSections';
import { LIMITS, validateReview } from '../lib/validation';
import { useAuth } from '../state/AuthContext';
import { fontSizes, fonts, radius, spacing } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { ChipStrip } from './Chips';
import { ConfirmSheet } from './forms';
import { RatingInput, StarRating } from './StarRating';
import { Button, StateMessage } from './ui';

const PAGE_SIZE = 5;
const SORTS: { value: ReviewSortBy; key: 'reviews.sortNewest' | 'reviews.sortHigh' | 'reviews.sortLow' }[] = [
  { value: 0, key: 'reviews.sortNewest' },
  { value: 1, key: 'reviews.sortHigh' },
  { value: 2, key: 'reviews.sortLow' },
];

const styles = (c: ColorTokens) => ({
  wrap: { gap: spacing.md },
  title: { color: c.text, fontFamily: fonts.heading, fontSize: fontSizes.xl },
  summary: { gap: spacing.sm },
  summaryTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  score: { color: c.text, fontFamily: fonts.headingBold, fontSize: fontSizes.xxl },
  summaryText: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.sm },
  barRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  barLabel: { width: 24, color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.bgSecondary, overflow: 'hidden' as const },
  barFill: { height: 6, backgroundColor: c.accent },
  barCount: { width: 28, textAlign: 'right' as const, color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  review: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.bgSecondary },
  mine: { borderWidth: 1, borderColor: c.accent },
  head: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: spacing.sm },
  author: { color: c.text, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, flexShrink: 1 },
  date: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  comment: { color: c.text, fontFamily: fonts.body, fontSize: fontSizes.md, lineHeight: 21 },
  empty: { color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.md },
  form: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  formLabel: { color: c.textSecondary, fontFamily: fonts.bodySemibold, fontSize: fontSizes.sm, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  textarea: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    color: c.text,
    backgroundColor: c.bg,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlignVertical: 'top' as const,
    outlineWidth: 0,
  },
  counter: { alignSelf: 'flex-end' as const, color: c.textSecondary, fontFamily: fonts.body, fontSize: fontSizes.xs },
  error: { color: c.error, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
});

interface ProductReviewsProps {
  productId: number;
  /** Called after a review is added or deleted so the product's header rating can be refreshed. */
  onChanged?: () => void;
}

/**
 * Reviews, as on the website: the rating summary, sorting, the signed-in user's own review (or the form to write one,
 * or a prompt to sign in), five at a time with "Show more". Review text is rendered as plain text only.
 */
export function ProductReviews({ productId, onChanged }: ProductReviewsProps) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = useFieldError();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { user, isLoading: authLoading } = useAuth();

  const [summary, setSummary] = useState<ReviewSummaryDto | null>(null);
  const [sortBy, setSortBy] = useState<ReviewSortBy>(0);
  const [items, setItems] = useState<ReviewDto[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const [mine, setMine] = useState<ReviewDto | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    fetchReviewSummary(productId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [productId]);

  const load = useCallback(
    async (nextPage: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const gen = generation.current;
      setLoading(true);
      setFailed(false);
      try {
        const result = await fetchProductReviews(productId, nextPage, PAGE_SIZE, sortBy);
        if (gen !== generation.current) return;
        setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items.filter((r) => !prev.some((x) => x.id === r.id))]));
        setPage(nextPage);
        setHasMore(result.hasMore);
      } catch {
        if (gen === generation.current) setFailed(true);
      } finally {
        if (gen === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [productId, sortBy]
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

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

  // The signed-in user's own review decides between "your review" and the form.
  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    let cancelled = false;
    setMine(undefined);
    fetchMyReview(productId)
      .then((review) => {
        if (!cancelled) setMine(review);
      })
      .catch(() => {
        if (!cancelled) setMine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, user]);

  const reloadList = () => {
    generation.current += 1;
    inFlight.current = false;
    setItems([]);
    setPage(0);
    void load(1);
  };

  const submit = async () => {
    if (submitting) return;
    const invalid = validateReview(rating, comment);
    if (invalid) {
      setFormError(text(invalid));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const review = await createReview(productId, rating, comment.trim());
      setMine(review);
      setRating(0);
      setComment('');
      loadSummary();
      reloadList();
      onChanged?.();
    } catch (e: unknown) {
      setFormError(e instanceof Error && e.message ? e.message : t('reviews.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMyReview(productId);
      setMine(null);
      setConfirmDelete(false);
      loadSummary();
      reloadList();
      onChanged?.();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error && e.message ? e.message : t('reviews.deleteFailed'));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const maxCount = summary ? Math.max(1, ...[5, 4, 3, 2, 1].map((star) => summary.ratingCounts[star] ?? 0)) : 1;

  return (
    <View style={s.wrap}>
      <Text style={s.title} accessibilityRole="header">
        {t('reviews.title')}
      </Text>

      {summary && summary.reviewCount > 0 ? (
        <View style={s.summary}>
          <View style={s.summaryTop}>
            <Text style={s.score}>{summary.averageRating.toFixed(1)}</Text>
            <View style={{ gap: 2 }}>
              <StarRating value={summary.averageRating} size={16} />
              <Text style={s.summaryText}>{t('reviews.count', { count: summary.reviewCount })}</Text>
            </View>
          </View>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.ratingCounts[star] ?? 0;
            return (
              <View key={star} style={s.barRow} accessible accessibilityLabel={`${star} / 5: ${count}`}>
                <Text style={s.barLabel}>{star}★</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(count / maxCount) * 100}%` }]} />
                </View>
                <Text style={s.barCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {authLoading ? null : !user ? (
        <Button variant="secondary" label={t('mobile.reviewsSignIn')} onPress={() => navigation.navigate('ProfileTab')} />
      ) : mine === undefined ? null : mine ? (
        <View style={[s.review, s.mine]}>
          <View style={s.head}>
            <Text style={s.author}>{t('reviews.yourReview')}</Text>
            <Text style={s.date}>{formatReviewDate(mine.createdAt)}</Text>
          </View>
          <StarRating value={mine.rating} size={13} />
          <Text style={s.comment}>{mine.comment}</Text>
          <Button variant="secondary" label={t('reviews.deleteReview')} onPress={() => setConfirmDelete(true)} />
          {deleteError ? (
            <Text style={s.error} accessibilityRole="alert">
              {deleteError}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={s.form}>
          <Text style={s.formLabel}>{t('reviews.leave')}</Text>
          <RatingInput value={rating} onChange={setRating} label={t('reviews.leave')} />
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('reviews.placeholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('reviews.placeholder')}
            multiline
            maxLength={LIMITS.review}
            style={s.textarea}
          />
          <Text style={s.counter}>
            {comment.length} / {LIMITS.review}
          </Text>
          {formError ? (
            <Text style={s.error} accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}
          <Button label={submitting ? t('reviews.sending') : t('reviews.send')} onPress={() => void submit()} loading={submitting} />
        </View>
      )}

      {items.length > 0 || summary?.reviewCount ? (
        <ChipStrip
          value={String(sortBy)}
          onChange={(value) => setSortBy(Number(value ?? 0) as ReviewSortBy)}
          options={SORTS.map((o) => ({ value: String(o.value), label: t(o.key) }))}
        />
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
      {!loading && !failed && items.length === 0 ? <Text style={s.empty}>{t('reviews.empty')}</Text> : null}
      {failed ? <StateMessage message={t('mobile.reviewsError')} actionLabel={t('mobile.retry')} onAction={() => void load(page + 1)} /> : null}
      {hasMore && !failed ? <Button variant="secondary" label={t('reviews.loadMore')} loading={loading} onPress={() => void load(page + 1)} /> : null}

      {confirmDelete ? (
        <ConfirmSheet
          title={t('reviews.deleteTitle')}
          description={t('reviews.deleteDesc')}
          confirmLabel={deleting ? t('common.loading') : t('common.delete')}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </View>
  );
}
