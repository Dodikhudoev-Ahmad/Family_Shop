import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatPrice } from '../../utils/formatPrice';
import {
  ApiError,
  createAdminPromoCode,
  deleteAdminPromoCode,
  fetchAdminPromoCodes,
  updateAdminPromoCode,
  type ApiPromoCodeDiscountType,
  type PromoCodeDto,
  type PromoCodeUpsertRequest,
} from '../../lib/api';
import './AdminPromoCodesPage.css';

const PAGE_SIZE = 10;

type ViewMode = 'table' | 'cards';

interface FormState {
  id: number | null;
  code: string;
  discountType: ApiPromoCodeDiscountType;
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  validFrom: string;
  validUntil: string;
  usageLimit: string;
  isActive: boolean;
}

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const EMPTY_FORM: FormState = {
  id: null,
  code: '',
  discountType: 0,
  discountValue: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  validFrom: todayDateInput(),
  validUntil: '',
  usageLimit: '',
  isActive: true,
};

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

// validFrom/validUntil are stored as UTC-anchored calendar dates (see handleSubmit) -
// format with timeZone: 'UTC' so the displayed date matches what was entered instead of
// shifting by the admin's local offset (toLocaleDateString would otherwise roll
// end-of-day UTC into the next local calendar day for any timezone ahead of UTC).
function formatValidUntil(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function isExpired(promo: PromoCodeDto): boolean {
  return new Date(promo.validUntil).getTime() < Date.now();
}

function isLimitReached(promo: PromoCodeDto): boolean {
  return promo.usageLimit !== null && promo.usageCount >= promo.usageLimit;
}

export function AdminPromoCodesPage() {
  const { showToast } = useToast();

  const [promoCodes, setPromoCodes] = useState<PromoCodeDto[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'cards' : 'table'));

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<PromoCodeDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestId = useRef(0);

  const load = () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    fetchAdminPromoCodes(page, PAGE_SIZE)
      .then((result) => {
        if (requestId.current !== id) return;
        setPromoCodes(result.items);
        setTotalCount(result.totalCount);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить промокоды.');
      })
      .finally(() => {
        if (requestId.current === id) setIsLoading(false);
      });
  };

  useEffect(load, [page]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors([]);
    setFormOpen(true);
  };

  const openEdit = (promo: PromoCodeDto) => {
    setForm({
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: String(promo.discountValue),
      minOrderAmount: promo.minOrderAmount !== null ? String(promo.minOrderAmount) : '',
      maxDiscountAmount: promo.maxDiscountAmount !== null ? String(promo.maxDiscountAmount) : '',
      validFrom: toDateInput(promo.validFrom),
      validUntil: toDateInput(promo.validUntil),
      usageLimit: promo.usageLimit !== null ? String(promo.usageLimit) : '',
      isActive: promo.isActive,
    });
    setFormErrors([]);
    setFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    if (!form.code.trim()) errors.push('Укажите код промокода.');
    const discountValue = Number(form.discountValue);
    if (!form.discountValue || Number.isNaN(discountValue) || discountValue <= 0) {
      errors.push('Укажите размер скидки больше нуля.');
    }
    if (form.discountType === 0 && discountValue > 100) {
      errors.push('Скидка в процентах не может превышать 100.');
    }
    if (!form.validFrom || !form.validUntil) errors.push('Укажите период действия промокода.');
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
      errors.push('Дата окончания действия должна быть позже даты начала.');
    }
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormErrors([]);

    const request: PromoCodeUpsertRequest = {
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
      maxDiscountAmount: form.discountType === 0 && form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
      // Send the picked calendar date as-is, anchored to UTC, instead of routing it
      // through `new Date(...)` — that would interpret it as local time and shift the
      // date by the admin's UTC offset once serialized back with toISOString().
      validFrom: `${form.validFrom}T00:00:00.000Z`,
      validUntil: `${form.validUntil}T23:59:59.999Z`,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      isActive: form.isActive,
    };

    const promise = form.id === null ? createAdminPromoCode(request) : updateAdminPromoCode(form.id, request);

    promise
      .then(() => {
        showToast(form.id === null ? 'Промокод создан.' : 'Промокод обновлён.');
        setFormOpen(false);
        load();
      })
      .catch((err: unknown) => {
        setFormErrors([err instanceof ApiError ? err.message : 'Не удалось сохранить промокод.']);
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    deleteAdminPromoCode(pendingDelete.id)
      .then(() => {
        showToast('Промокод удалён.');
        setPendingDelete(null);
        load();
      })
      .catch((err: unknown) => {
        showToast(err instanceof ApiError ? err.message : 'Не удалось удалить промокод.', 'error');
      })
      .finally(() => setIsDeleting(false));
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className="admin-promo-codes">
        <header className="admin-categories__header">
          <div>
            <h1>Промокоды</h1>
            <p>Скидочные коды для корзины и оформления заказа</p>
          </div>
          <div className="admin-categories__header-actions">
            <div className="admin-orders__view-toggle">
              <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')} aria-label="Табличный вид">
                <TableIcon />
              </button>
              <button className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')} aria-label="Карточный вид">
                <GridIcon />
              </button>
            </div>
            <button className="admin-categories__add" onClick={openCreate}>
              <PlusIcon /> Добавить промокод
            </button>
          </div>
        </header>

        {error && <p className="admin-page-error">{error}</p>}

        {!error && isLoading && (view === 'table' ? <PromoCodesSkeleton /> : <PromoCodesCardsSkeleton />)}

        {!error && !isLoading && promoCodes !== null && promoCodes.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty__icon">
              <PromoEmptyIcon />
            </div>
            <h3>Промокодов пока нет</h3>
            <p>Создайте первый промокод, чтобы предложить покупателям скидку.</p>
            <button className="admin-categories__add admin-categories__add--empty" onClick={openCreate}>
              <PlusIcon /> Добавить промокод
            </button>
          </div>
        )}

        {!error && !isLoading && promoCodes !== null && promoCodes.length > 0 && (
          <>
            {view === 'table' ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Код</th>
                      <th>Скидка</th>
                      <th>Условия</th>
                      <th>Действует до</th>
                      <th>Использовано</th>
                      <th>Статус</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((promo) => (
                      <tr key={promo.id}>
                        <td>
                          <code className="admin-categories__slug">{promo.code}</code>
                        </td>
                        <td>{formatDiscount(promo)}</td>
                        <td>{formatConditions(promo)}</td>
                        <td>{formatValidUntil(promo.validUntil)}</td>
                        <td>{promo.usageLimit !== null ? `${promo.usageCount} / ${promo.usageLimit}` : promo.usageCount}</td>
                        <td>
                          <PromoStatusBadge promo={promo} />
                        </td>
                        <td>
                          <div className="admin-categories__row-actions">
                            <button className="admin-table__expand" onClick={() => openEdit(promo)}>
                              Изменить
                            </button>
                            <button className="admin-categories__delete" onClick={() => setPendingDelete(promo)}>
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PromoCodesCards promoCodes={promoCodes} onEdit={openEdit} onDelete={setPendingDelete} />
            )}

            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Назад
              </button>
              <span>
                Страница {page} из {totalPages} · {totalCount} промокод(ов)
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Далее
              </button>
            </div>
          </>
        )}
      </div>

      <PromoCodeFormModal
        open={formOpen}
        form={form}
        setForm={setForm}
        errors={formErrors}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Удалить промокод «${pendingDelete?.code}»?`}
        description="Это действие необратимо."
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

function formatDiscount(promo: PromoCodeDto): string {
  return promo.discountType === 0 ? `−${promo.discountValue}%` : `−${formatPrice(promo.discountValue)}`;
}

function formatConditions(promo: PromoCodeDto): string {
  const parts: string[] = [];
  if (promo.minOrderAmount) parts.push(`от ${formatPrice(promo.minOrderAmount)}`);
  if (promo.discountType === 0 && promo.maxDiscountAmount) parts.push(`макс. ${formatPrice(promo.maxDiscountAmount)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function PromoStatusBadge({ promo }: { promo: PromoCodeDto }) {
  if (!promo.isActive) return <span className="admin-promo-codes__badge is-muted">Выключен</span>;
  if (isExpired(promo)) return <span className="admin-promo-codes__badge is-muted">Истёк</span>;
  if (isLimitReached(promo)) return <span className="admin-promo-codes__badge is-muted">Лимит исчерпан</span>;
  return <span className="admin-promo-codes__badge is-active">Активен</span>;
}

function PromoCodeFormModal({
  open,
  form,
  setForm,
  errors,
  isSaving,
  onSubmit,
  onClose,
}: {
  open: boolean;
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  errors: string[];
  isSaving: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isSaving, onClose]);

  if (!open) return null;

  return (
    <div className="admin-modal__backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h2>{form.id === null ? 'Новый промокод' : 'Изменить промокод'}</h2>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть">
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="admin-modal__form">
          <label className="admin-form-field">
            <span>Код</span>
            <input
              type="text"
              value={form.code}
              autoFocus
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="SALE20"
            />
          </label>

          <div className="admin-promo-codes__form-row">
            <label className="admin-form-field">
              <span>Тип скидки</span>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, discountType: Number(e.target.value) as ApiPromoCodeDiscountType }))
                }
              >
                <option value={0}>Процент от заказа</option>
                <option value={1}>Фиксированная сумма</option>
              </select>
            </label>

            <label className="admin-form-field">
              <span>{form.discountType === 0 ? 'Скидка, %' : 'Скидка, ₸'}</span>
              <input
                type="number"
                min="0"
                value={form.discountValue}
                onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                placeholder={form.discountType === 0 ? '20' : '5000'}
              />
            </label>
          </div>

          <div className="admin-promo-codes__form-row">
            <label className="admin-form-field">
              <span>Мин. сумма заказа (опционально)</span>
              <input
                type="number"
                min="0"
                value={form.minOrderAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, minOrderAmount: e.target.value }))}
                placeholder="10000"
              />
            </label>

            {form.discountType === 0 && (
              <label className="admin-form-field">
                <span>Макс. скидка, ₸ (опционально)</span>
                <input
                  type="number"
                  min="0"
                  value={form.maxDiscountAmount}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxDiscountAmount: e.target.value }))}
                  placeholder="5000"
                />
              </label>
            )}
          </div>

          <div className="admin-promo-codes__form-row">
            <label className="admin-form-field">
              <span>Действует с</span>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
              />
            </label>

            <label className="admin-form-field">
              <span>Действует до</span>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))}
              />
            </label>
          </div>

          <label className="admin-form-field">
            <span>Лимит использований (опционально)</span>
            <input
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setForm((prev) => ({ ...prev, usageLimit: e.target.value }))}
              placeholder="Без ограничений"
            />
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>Промокод активен</span>
          </label>

          {errors.length > 0 && (
            <div className="admin-form-errors">
              {errors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </div>
          )}

          <div className="admin-modal__actions">
            <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={isSaving}>
              Отмена
            </button>
            <button type="submit" className="confirm-dialog__confirm" disabled={isSaving}>
              {isSaving ? <span className="confirm-dialog__spinner" /> : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PromoCodesCards({
  promoCodes,
  onEdit,
  onDelete,
}: {
  promoCodes: PromoCodeDto[];
  onEdit: (promo: PromoCodeDto) => void;
  onDelete: (promo: PromoCodeDto) => void;
}) {
  return (
    <div className="admin-cards">
      {promoCodes.map((promo) => (
        <div key={promo.id} className="admin-category-card">
          <div className="admin-category-card__top">
            <code className="admin-categories__slug">{promo.code}</code>
            <PromoStatusBadge promo={promo} />
          </div>
          <div className="admin-category-card__parent">{formatDiscount(promo)} · {formatConditions(promo)}</div>
          <div className="admin-category-card__parent">
            До {formatValidUntil(promo.validUntil)} · использовано{' '}
            {promo.usageLimit !== null ? `${promo.usageCount} / ${promo.usageLimit}` : promo.usageCount}
          </div>
          <div className="admin-category-card__actions">
            <button className="admin-table__expand" onClick={() => onEdit(promo)}>
              Изменить
            </button>
            <button className="admin-categories__delete" onClick={() => onDelete(promo)}>
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromoCodesCardsSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="admin-category-card">
          <span className="skeleton" style={{ height: 18, width: '50%', marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
          <span className="skeleton" style={{ height: 14, width: '60%' }} />
        </div>
      ))}
    </div>
  );
}

function PromoCodesSkeleton() {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Код</th>
            <th>Скидка</th>
            <th>Условия</th>
            <th>Действует до</th>
            <th>Использовано</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j}>
                  <span className="skeleton admin-skeleton-cell" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 7h12M6 3v10" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PromoEmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M6 20 20 6l14 14-14 14L6 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
