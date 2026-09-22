import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { slugify } from '../../utils/slugify';
import {
  ApiError,
  createAdminCategory,
  deleteAdminCategory,
  fetchCategories,
  updateAdminCategory,
} from '../../lib/api';
import type { CategoryDto } from '../../types/api';
import './AdminCategoriesPage.css';

type ViewMode = 'table' | 'cards';

interface FormState {
  id: number | null;
  name: string;
  slug: string;
  parentCategoryId: number | null;
  hasSizes: boolean;
  slugTouched: boolean;
}

const EMPTY_FORM: FormState = { id: null, name: '', slug: '', parentCategoryId: null, hasSizes: true, slugTouched: false };

export function AdminCategoriesPage() {
  const { showToast } = useToast();

  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'cards' : 'table'));

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<CategoryDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestId = useRef(0);

  const load = () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    fetchCategories()
      .then((data) => {
        if (requestId.current !== id) return;
        setCategories(data);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить категории.');
      })
      .finally(() => {
        if (requestId.current === id) setIsLoading(false);
      });
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors([]);
    setFormOpen(true);
  };

  const openEdit = (category: CategoryDto) => {
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentCategoryId: category.parentCategoryId,
      hasSizes: category.hasSizes,
      slugTouched: true,
    });
    setFormErrors([]);
    setFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    if (!form.name.trim()) errors.push('Укажите название категории.');
    if (!form.slug.trim()) errors.push('Укажите адрес (slug).');
    if (form.parentCategoryId === form.id) errors.push('Категория не может быть родителем самой себе.');
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormErrors([]);
    const request = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      parentCategoryId: form.parentCategoryId,
      hasSizes: form.hasSizes,
    };
    const promise = form.id === null ? createAdminCategory(request) : updateAdminCategory(form.id, request);

    promise
      .then(() => {
        showToast(form.id === null ? 'Категория создана.' : 'Категория обновлена.');
        setFormOpen(false);
        load();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setFormErrors([err.message]);
        } else {
          setFormErrors(['Не удалось сохранить категорию.']);
        }
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    deleteAdminCategory(pendingDelete.id)
      .then(() => {
        showToast('Категория удалена.');
        setPendingDelete(null);
        load();
      })
      .catch((err: unknown) => {
        showToast(err instanceof ApiError ? err.message : 'Не удалось удалить категорию.', 'error');
      })
      .finally(() => setIsDeleting(false));
  };

  return (
    <AdminLayout>
      <div className="admin-categories">
        <header className="admin-categories__header">
          <div>
            <h1>Категории</h1>
            <p>Разделы каталога Family Shop</p>
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
              <PlusIcon /> Добавить категорию
            </button>
          </div>
        </header>

        {error && <p className="admin-page-error">{error}</p>}

        {!error && isLoading && (view === 'table' ? <CategoriesSkeleton /> : <CategoriesCardsSkeleton />)}

        {!error && !isLoading && categories !== null && categories.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty__icon">
              <CategoriesEmptyIcon />
            </div>
            <h3>Категорий пока нет</h3>
            <p>Создайте первую категорию, чтобы начать наполнять каталог товарами.</p>
            <button className="admin-categories__add admin-categories__add--empty" onClick={openCreate}>
              <PlusIcon /> Добавить категорию
            </button>
          </div>
        )}

        {!error && !isLoading && categories !== null && categories.length > 0 && (
          view === 'table' ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Адрес (slug)</th>
                    <th>Родительская категория</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td className="admin-categories__name">{category.name}</td>
                      <td>
                        <code className="admin-categories__slug">{category.slug}</code>
                      </td>
                      <td>{categories.find((c) => c.id === category.parentCategoryId)?.name ?? '—'}</td>
                      <td>
                        <div className="admin-categories__row-actions">
                          <button className="admin-table__expand" onClick={() => openEdit(category)}>
                            Изменить
                          </button>
                          <button className="admin-categories__delete" onClick={() => setPendingDelete(category)}>
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
            <CategoriesCards
              categories={categories}
              onEdit={openEdit}
              onDelete={setPendingDelete}
            />
          )
        )}
      </div>

      <CategoryFormModal
        open={formOpen}
        form={form}
        setForm={setForm}
        errors={formErrors}
        isSaving={isSaving}
        categories={categories ?? []}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Удалить категорию «${pendingDelete?.name}»?`}
        description="Это действие необратимо. Удалить можно только категорию без товаров и подкатегорий."
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

function CategoryFormModal({
  open,
  form,
  setForm,
  errors,
  isSaving,
  categories,
  onSubmit,
  onClose,
}: {
  open: boolean;
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  errors: string[];
  isSaving: boolean;
  categories: CategoryDto[];
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
          <h2>{form.id === null ? 'Новая категория' : 'Изменить категорию'}</h2>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть">
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="admin-modal__form">
          <label className="admin-form-field">
            <span>Название</span>
            <input
              type="text"
              value={form.name}
              autoFocus
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  slug: prev.slugTouched ? prev.slug : slugify(name),
                }));
              }}
              placeholder="Например, Верхняя одежда"
            />
          </label>

          <label className="admin-form-field">
            <span>Адрес (slug)</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, slug: slugify(e.target.value), slugTouched: true }))
              }
              placeholder="verhnyaya-odezhda"
            />
          </label>

          <label className="admin-form-field">
            <span>Родительская категория</span>
            <select
              value={form.parentCategoryId ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  parentCategoryId: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
            >
              <option value="">Нет (корневая категория)</option>
              {categories
                .filter((c) => c.id !== form.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.hasSizes}
              onChange={(e) => setForm((prev) => ({ ...prev, hasSizes: e.target.checked }))}
            />
            <span>Товары этой категории продаются по размерам</span>
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

function CategoriesCards({
  categories,
  onEdit,
  onDelete,
}: {
  categories: CategoryDto[];
  onEdit: (category: CategoryDto) => void;
  onDelete: (category: CategoryDto) => void;
}) {
  return (
    <div className="admin-cards">
      {categories.map((category) => (
        <div key={category.id} className="admin-category-card">
          <div className="admin-category-card__top">
            <span className="admin-category-card__name">{category.name}</span>
            <code className="admin-categories__slug">{category.slug}</code>
          </div>
          <div className="admin-category-card__parent">
            Родительская категория: {categories.find((c) => c.id === category.parentCategoryId)?.name ?? '—'}
          </div>
          <div className="admin-category-card__actions">
            <button className="admin-table__expand" onClick={() => onEdit(category)}>
              Изменить
            </button>
            <button className="admin-categories__delete" onClick={() => onDelete(category)}>
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoriesCardsSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="admin-category-card">
          <span className="skeleton" style={{ height: 18, width: '60%', marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
          <span className="skeleton" style={{ height: 14, width: '40%' }} />
        </div>
      ))}
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

function CategoriesSkeleton() {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Название</th>
            <th>Адрес (slug)</th>
            <th>Родительская категория</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 4 }).map((__, j) => (
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

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CategoriesEmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="6" y="6" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="22" y="6" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6" y="22" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="22" y="22" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
