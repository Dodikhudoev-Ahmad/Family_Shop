import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  ApiError,
  createAdminPromoBanner,
  deleteAdminPromoBanner,
  fetchAdminPromoBanners,
  updateAdminPromoBanner,
  uploadAdminPromoBannerImage,
  type ApiPromoBannerPlacement,
  type PromoBannerDto,
  type PromoBannerUpsertRequest,
} from '../../lib/api';
import './AdminPromoBannersPage.css';

type ViewMode = 'table' | 'cards';

interface FormState {
  id: number | null;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string | null;
  isImageUploading: boolean;
  imageError: string | null;
  isActive: boolean;
  sortOrder: string;
  showOnHome: boolean;
  showOnCart: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  subtitle: '',
  buttonText: '',
  buttonLink: '',
  imageUrl: null,
  isImageUploading: false,
  imageError: null,
  isActive: true,
  sortOrder: '0',
  showOnHome: true,
  showOnCart: false,
};

/** Placement is stored as a single enum (0=Home, 1=Cart, 2=Both) but edited as two
 * independent checkboxes - these convert between the two representations. */
function placementToCheckboxes(placement: ApiPromoBannerPlacement): { showOnHome: boolean; showOnCart: boolean } {
  return { showOnHome: placement === 0 || placement === 2, showOnCart: placement === 1 || placement === 2 };
}

function checkboxesToPlacement(showOnHome: boolean, showOnCart: boolean): ApiPromoBannerPlacement {
  if (showOnHome && showOnCart) return 2;
  return showOnCart ? 1 : 0;
}

function placementLabel(placement: ApiPromoBannerPlacement): string {
  if (placement === 2) return 'Главная + Корзина';
  return placement === 1 ? 'Корзина' : 'Главная';
}

export function AdminPromoBannersPage() {
  const { showToast } = useToast();

  const [banners, setBanners] = useState<PromoBannerDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'cards' : 'table'));

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<PromoBannerDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestId = useRef(0);

  const load = () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    fetchAdminPromoBanners()
      .then((data) => {
        if (requestId.current !== id) return;
        setBanners(data);
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить баннеры.');
      })
      .finally(() => {
        if (requestId.current === id) setIsLoading(false);
      });
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, sortOrder: String((banners?.length ?? 0) * 10) });
    setFormErrors([]);
    setFormOpen(true);
  };

  const openEdit = (banner: PromoBannerDto) => {
    setForm({
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle ?? '',
      buttonText: banner.buttonText ?? '',
      buttonLink: banner.buttonLink ?? '',
      imageUrl: banner.imageUrl,
      isImageUploading: false,
      imageError: null,
      isActive: banner.isActive,
      sortOrder: String(banner.sortOrder),
      ...placementToCheckboxes(banner.placement),
    });
    setFormErrors([]);
    setFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    if (!form.title.trim()) errors.push('Укажите заголовок баннера.');
    if (form.isImageUploading) errors.push('Дождитесь загрузки изображения.');
    if (!form.showOnHome && !form.showOnCart) errors.push('Выберите хотя бы одно место показа.');
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    setFormErrors([]);

    const request: PromoBannerUpsertRequest = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      buttonText: form.buttonText.trim() || null,
      buttonLink: form.buttonLink.trim() || null,
      imageUrl: form.imageUrl,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
      placement: checkboxesToPlacement(form.showOnHome, form.showOnCart),
    };

    const promise = form.id === null ? createAdminPromoBanner(request) : updateAdminPromoBanner(form.id, request);

    promise
      .then(() => {
        showToast(form.id === null ? 'Баннер создан.' : 'Баннер обновлён.');
        setFormOpen(false);
        load();
      })
      .catch((err: unknown) => {
        setFormErrors([err instanceof ApiError ? err.message : 'Не удалось сохранить баннер.']);
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    deleteAdminPromoBanner(pendingDelete.id)
      .then(() => {
        showToast('Баннер удалён.');
        setPendingDelete(null);
        load();
      })
      .catch((err: unknown) => {
        showToast(err instanceof ApiError ? err.message : 'Не удалось удалить баннер.', 'error');
      })
      .finally(() => setIsDeleting(false));
  };

  return (
    <AdminLayout>
      <div className="admin-promo-banners">
        <header className="admin-categories__header">
          <div>
            <h1>Промо-баннеры</h1>
            <p>Акционные баннеры на главной странице</p>
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
              <PlusIcon /> Добавить баннер
            </button>
          </div>
        </header>

        {error && <p className="admin-page-error">{error}</p>}

        {!error && isLoading && (view === 'table' ? <BannersSkeleton /> : <BannersCardsSkeleton />)}

        {!error && !isLoading && banners !== null && banners.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty__icon">
              <BannerEmptyIcon />
            </div>
            <h3>Баннеров пока нет</h3>
            <p>Добавьте баннер, чтобы он появился на главной странице.</p>
            <button className="admin-categories__add admin-categories__add--empty" onClick={openCreate}>
              <PlusIcon /> Добавить баннер
            </button>
          </div>
        )}

        {!error && !isLoading && banners !== null && banners.length > 0 && (
          view === 'table' ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Баннер</th>
                    <th>Заголовок</th>
                    <th>Кнопка</th>
                    <th>Место показа</th>
                    <th>Порядок</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {banners.map((banner) => (
                    <tr key={banner.id}>
                      <td>
                        {banner.imageUrl ? (
                          <img src={banner.imageUrl} alt="" className="admin-promo-banners__thumb" />
                        ) : (
                          <span className="admin-promo-banners__thumb admin-promo-banners__thumb--empty" />
                        )}
                      </td>
                      <td>
                        <div className="admin-categories__name">{banner.title}</div>
                        {banner.subtitle && <div className="admin-promo-banners__subtitle">{banner.subtitle}</div>}
                      </td>
                      <td>{banner.buttonText || '—'}</td>
                      <td>{placementLabel(banner.placement)}</td>
                      <td>{banner.sortOrder}</td>
                      <td>
                        <span className={`admin-promo-codes__badge ${banner.isActive ? 'is-active' : 'is-muted'}`}>
                          {banner.isActive ? 'Активен' : 'Выключен'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-categories__row-actions">
                          <button className="admin-table__expand" onClick={() => openEdit(banner)}>
                            Изменить
                          </button>
                          <button className="admin-categories__delete" onClick={() => setPendingDelete(banner)}>
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
            <BannersCards banners={banners} onEdit={openEdit} onDelete={setPendingDelete} />
          )
        )}
      </div>

      <PromoBannerFormModal
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
        title={`Удалить баннер «${pendingDelete?.title}»?`}
        description="Это действие необратимо."
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

function BannersCards({
  banners,
  onEdit,
  onDelete,
}: {
  banners: PromoBannerDto[];
  onEdit: (banner: PromoBannerDto) => void;
  onDelete: (banner: PromoBannerDto) => void;
}) {
  return (
    <div className="admin-cards">
      {banners.map((banner) => (
        <div key={banner.id} className="admin-product-card">
          <div className="admin-product-card__media">
            {banner.imageUrl && <img src={banner.imageUrl} alt="" />}
          </div>
          <div className="admin-product-card__body">
            <h3>{banner.title}</h3>
            {banner.subtitle && <span className="admin-promo-banners__subtitle">{banner.subtitle}</span>}
            <span className="admin-promo-banners__subtitle">{placementLabel(banner.placement)}</span>
            <span className={`admin-promo-codes__badge ${banner.isActive ? 'is-active' : 'is-muted'}`}>
              {banner.isActive ? 'Активен' : 'Выключен'}
            </span>
          </div>
          <div className="admin-product-card__actions">
            <button className="admin-table__expand" onClick={() => onEdit(banner)}>
              Изменить
            </button>
            <button className="admin-categories__delete" onClick={() => onDelete(banner)}>
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromoBannerFormModal({
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
          <h2>{form.id === null ? 'Новый баннер' : 'Изменить баннер'}</h2>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть">
            &times;
          </button>
        </div>

        <form onSubmit={onSubmit} className="admin-modal__form">
          <BannerImageDropzone form={form} setForm={setForm} />

          <label className="admin-form-field">
            <span>Заголовок</span>
            <input
              type="text"
              value={form.title}
              autoFocus
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Осенняя распродажа"
            />
          </label>

          <label className="admin-form-field">
            <span>Подзаголовок (опционально)</span>
            <input
              type="text"
              value={form.subtitle}
              onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
              placeholder="Скидки до 30% на новую коллекцию"
            />
          </label>

          <div className="admin-promo-codes__form-row">
            <label className="admin-form-field">
              <span>Текст кнопки (опционально)</span>
              <input
                type="text"
                value={form.buttonText}
                onChange={(e) => setForm((prev) => ({ ...prev, buttonText: e.target.value }))}
                placeholder="Смотреть коллекцию"
              />
            </label>

            <label className="admin-form-field">
              <span>Ссылка кнопки (опционально)</span>
              <input
                type="text"
                value={form.buttonLink}
                onChange={(e) => setForm((prev) => ({ ...prev, buttonLink: e.target.value }))}
                placeholder="/catalog?category=women"
              />
            </label>
          </div>

          <label className="admin-form-field">
            <span>Порядок показа</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
            />
          </label>

          <div className="admin-form-field">
            <span>Место показа</span>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.showOnHome}
                onChange={(e) => setForm((prev) => ({ ...prev, showOnHome: e.target.checked }))}
              />
              <span>Главная страница</span>
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.showOnCart}
                onChange={(e) => setForm((prev) => ({ ...prev, showOnCart: e.target.checked }))}
              />
              <span>Корзина</span>
            </label>
          </div>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>Баннер активен</span>
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

function BannerImageDropzone({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, imageUrl: previewUrl, isImageUploading: true, imageError: null }));

    uploadAdminPromoBannerImage(file)
      .then((url) => setForm((prev) => ({ ...prev, imageUrl: url, isImageUploading: false })))
      .catch((err: unknown) =>
        setForm((prev) => ({
          ...prev,
          isImageUploading: false,
          imageError: err instanceof ApiError ? err.message : 'Не удалось загрузить изображение.',
        }))
      );
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="admin-form-field has-error-wrap">
      <span className="admin-form-field__label-standalone">Изображение баннера</span>
      <div
        className={`admin-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <UploadIcon />
        <p>Перетащите фото сюда или нажмите, чтобы выбрать</p>
        <span>JPEG, PNG, WEBP или GIF, до 5 МБ</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {form.imageUrl && (
        <div className="admin-dropzone__previews">
          <div className={`admin-dropzone__preview ${form.imageError ? 'has-error' : ''}`}>
            <img src={form.imageUrl} alt="" />
            {form.isImageUploading && <span className="admin-dropzone__spinner" />}
            {form.imageError && <span className="admin-dropzone__preview-error">{form.imageError}</span>}
            <button
              type="button"
              className="admin-dropzone__remove"
              onClick={() => setForm((prev) => ({ ...prev, imageUrl: null, imageError: null }))}
              aria-label="Удалить изображение"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BannersCardsSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="admin-product-card">
          <span className="skeleton" style={{ height: 160, width: '100%', marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
          <span className="skeleton" style={{ height: 14, width: '40%' }} />
        </div>
      ))}
    </div>
  );
}

function BannersSkeleton() {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Баннер</th>
            <th>Заголовок</th>
            <th>Кнопка</th>
            <th>Порядок</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 3 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 6 }).map((__, j) => (
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

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 15V4m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BannerEmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="5" y="10" width="30" height="20" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 26 17 18l5 5 6-7 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
