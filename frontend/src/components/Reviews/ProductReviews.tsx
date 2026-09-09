import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StarRating } from '../StarRating/StarRating';
import {
  ApiError,
  createReview,
  deleteMyReview,
  fetchMyReview,
  fetchProductReviews,
  fetchReviewSummary,
  type ReviewDto,
  type ReviewSortBy,
  type ReviewSummaryDto,
} from '../../lib/api';
import './ProductReviews.css';

const PAGE_SIZE = 5;

const SORT_OPTIONS: { value: ReviewSortBy; label: string }[] = [
  { value: 0, label: 'Сначала новые' },
  { value: 1, label: 'Сначала высокий рейтинг' },
  { value: 2, label: 'Сначала низкий рейтинг' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function ProductReviews({ productId }: { productId: number }) {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<ReviewSummaryDto | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<ReviewSortBy>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myReview, setMyReview] = useState<ReviewDto | null | undefined>(undefined);

  const requestIdRef = useRef(0);

  const loadSummary = () => {
    fetchReviewSummary(productId)
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (!user) {
      setMyReview(null);
      return;
    }
    let cancelled = false;
    fetchMyReview(productId)
      .then((r) => {
        if (!cancelled) setMyReview(r);
      })
      .catch(() => {
        if (!cancelled) setMyReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, user]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    fetchProductReviews(productId, { sortBy, page: 1, pageSize: PAGE_SIZE })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setReviews(result.items);
        setPage(1);
        setHasMore(result.hasMore);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить отзывы.');
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsLoading(false);
      });
  }, [productId, sortBy]);

  const loadMore = () => {
    setIsLoadingMore(true);
    const nextPage = page + 1;
    fetchProductReviews(productId, { sortBy, page: nextPage, pageSize: PAGE_SIZE })
      .then((result) => {
        setReviews((prev) => [...(prev ?? []), ...result.items]);
        setPage(nextPage);
        setHasMore(result.hasMore);
      })
      .catch((err: unknown) => showToast(err instanceof ApiError ? err.message : 'Не удалось загрузить отзывы.', 'error'))
      .finally(() => setIsLoadingMore(false));
  };

  const handleCreated = (review: ReviewDto) => {
    setMyReview(review);
    setReviews((prev) => (sortBy === 0 ? [review, ...(prev ?? [])] : prev));
    loadSummary();
    showToast('Спасибо за отзыв!');
  };

  const handleDelete = () => {
    deleteMyReview(productId)
      .then(() => {
        setReviews((prev) => (prev ?? []).filter((r) => r.id !== myReview?.id));
        setMyReview(null);
        loadSummary();
        showToast('Отзыв удалён', 'info');
      })
      .catch((err: unknown) => showToast(err instanceof ApiError ? err.message : 'Не удалось удалить отзыв.', 'error'));
  };

  return (
    <section className="reviews">
      <h3 className="home-section__title">Отзывы</h3>

      <ReviewsSummary summary={summary} />

      {authLoading ? null : !user ? (
        <p className="reviews__login-prompt">
          <Link to="/login">Войдите</Link>, чтобы оставить отзыв о товаре.
        </p>
      ) : myReview === undefined ? null : myReview ? (
        <MyReviewCard review={myReview} onDelete={handleDelete} />
      ) : (
        <ReviewForm productId={productId} onCreated={handleCreated} />
      )}

      {reviews !== null && reviews.length > 0 && (
        <div className="reviews__toolbar">
          <span className="reviews__count">{summary?.reviewCount ?? reviews.length} отзыв(ов)</span>
          <select className="reviews__sort" value={sortBy} onChange={(e) => setSortBy(Number(e.target.value) as ReviewSortBy)}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="reviews__empty">{error}</p>}

      {!error && isLoading && <ReviewsSkeleton />}

      {!error && !isLoading && reviews !== null && reviews.length === 0 && (
        <p className="reviews__empty">Пока нет отзывов об этом товаре. Будьте первым!</p>
      )}

      {!error && !isLoading && reviews !== null && reviews.length > 0 && (
        <ul className="reviews__list">
          {reviews.map((review) => (
            <li key={review.id} className="review-card">
              <div className="review-card__top">
                <span className="review-card__author">{review.userName}</span>
                <span className="review-card__date">{formatDate(review.createdAt)}</span>
              </div>
              <StarRating value={review.rating} size="sm" />
              <p className="review-card__comment">{review.comment}</p>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button className="reviews__more" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? 'Загрузка...' : 'Показать ещё'}
        </button>
      )}
    </section>
  );
}

function ReviewsSummary({ summary }: { summary: ReviewSummaryDto | null }) {
  if (!summary || summary.reviewCount === 0) return null;

  const maxCount = Math.max(1, ...[5, 4, 3, 2, 1].map((star) => summary.ratingCounts[star] ?? 0));

  return (
    <div className="reviews__summary">
      <div className="reviews__summary-score">
        <span className="reviews__summary-number">{summary.averageRating.toFixed(1)}</span>
        <StarRating value={summary.averageRating} size="md" />
        <span className="reviews__summary-count">{summary.reviewCount} отзыв(ов)</span>
      </div>
      <div className="reviews__summary-bars">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.ratingCounts[star] ?? 0;
          const percent = (count / maxCount) * 100;
          return (
            <div key={star} className="reviews__bar-row">
              <span className="reviews__bar-label">{star}★</span>
              <span className="reviews__bar-track">
                <span className="reviews__bar-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="reviews__bar-count">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyReviewCard({ review, onDelete }: { review: ReviewDto; onDelete: () => void }) {
  return (
    <div className="review-card review-card--mine">
      <div className="review-card__top">
        <span className="review-card__author">Ваш отзыв</span>
        <span className="review-card__date">{formatDate(review.createdAt)}</span>
      </div>
      <StarRating value={review.rating} size="sm" />
      <p className="review-card__comment">{review.comment}</p>
      <button className="reviews__delete" onClick={onDelete}>
        Удалить отзыв
      </button>
    </div>
  );
}

function ReviewForm({ productId, onCreated }: { productId: number; onCreated: (review: ReviewDto) => void }) {
  const { showToast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      showToast('Выберите оценку от 1 до 5', 'error');
      return;
    }
    if (!comment.trim()) {
      showToast('Напишите текст отзыва', 'error');
      return;
    }

    setIsSubmitting(true);
    createReview(productId, rating, comment.trim())
      .then((review) => {
        onCreated(review);
        setRating(0);
        setComment('');
      })
      .catch((err: unknown) => showToast(err instanceof ApiError ? err.message : 'Не удалось отправить отзыв.', 'error'))
      .finally(() => setIsSubmitting(false));
  };

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <span className="review-form__label">Оставить отзыв</span>
      <StarRating value={rating} interactive onChange={setRating} size="lg" />
      <textarea
        className="review-form__textarea"
        placeholder="Расскажите о своих впечатлениях о товаре"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
      />
      <button type="submit" className="btn btn--primary review-form__submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправка...' : 'Отправить отзыв'}
      </button>
    </form>
  );
}

function ReviewsSkeleton() {
  return (
    <ul className="reviews__list">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="review-card">
          <span className="skeleton" style={{ height: 14, width: 140, marginBottom: 8, display: 'block' }} />
          <span className="skeleton" style={{ height: 14, width: 90, marginBottom: 10, display: 'block' }} />
          <span className="skeleton" style={{ height: 14, width: '100%', marginBottom: 6, display: 'block' }} />
          <span className="skeleton" style={{ height: 14, width: '70%', display: 'block' }} />
        </li>
      ))}
    </ul>
  );
}
