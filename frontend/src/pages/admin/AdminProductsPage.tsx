import { useEffect, useMemo, useRef, useState, type DragEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatPrice } from '../../utils/formatPrice';
import {
  ApiError,
  createAdminProduct,
  deleteAdminProduct,
  fetchCategories,
  fetchProductsPage,
  updateAdminProduct,
  uploadAdminProductImage,
  type ProductUpsertRequest,
} from '../../lib/api';
import type { ApiGender, CategoryDto, ProductDto } from '../../types/api';
import './AdminProductsPage.css';

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 300;

type ViewMode = 'table' | 'cards';

const GENDER_LABEL: Record<ApiGender, string> = { 0: 'Мужское', 1: 'Женское', 2: 'Детское' };
const GENDER_OPTIONS: ApiGender[] = [0, 1, 2];

// Categories "Женское"/"Мужское"/"Детское" already say who the product is for, so Gender
// there would just duplicate the category - only categories with no gender of their own
// (e.g. "Обувь и сумки") need the field shown so an admin can set it explicitly.
const CATEGORY_SLUG_TO_GENDER: Partial<Record<string, ApiGender>> = { women: 1, men: 0, kids: 2 };

function impliedGender(categories: CategoryDto[], categoryId: string): ApiGender | undefined {
  const category = categories.find((c) => String(c.id) === categoryId);
  return category ? CATEGORY_SLUG_TO_GENDER[category.slug] : undefined;
}

interface ImageSlot {
  id: string;
  previewUrl: string;
  url: string | null;
  uploading: boolean;
  error: string | null;
}

interface FormState {
  id: number | null;
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  stock: string;
  categoryId: string;
  gender: ApiGender;
  isBestseller: boolean;
  images: ImageSlot[];
}

function emptyForm(defaultCategoryId: string): FormState {
  return {
    id: null,
    name: '',
    description: '',
    price: '',
    discountPrice: '',
    stock: '',
    categoryId: defaultCategoryId,
    gender: 0,
    isBestseller: false,
    images: [],
  };
}

export function AdminProductsPage() {
  const { showToast } = useToast();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<ViewMode>(() => (isMobile ? 'cards' : 'table'));
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(''));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<ProductDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => showToast('Не удалось загрузить категории.', 'error'));
  }, [showToast]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, debouncedSearch]);

  const loadProducts = () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    fetchProductsPage({
      categoryId: categoryFilter === 'all' ? undefined : Number(categoryFilter),
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setProducts(result.items);
        setTotalCount(result.totalCount);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить товары.');
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsLoading(false);
      });
  };

  useEffect(loadProducts, [categoryFilter, debouncedSearch, page]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const openCreate = () => {
    const defaultCategoryId = categories[0] ? String(categories[0].id) : '';
    const form = emptyForm(defaultCategoryId);
    setForm({ ...form, gender: impliedGender(categories, defaultCategoryId) ?? form.gender });
    setFieldErrors({});
    setFormErrors([]);
    setDrawerOpen(true);
  };

  const openEdit = (product: ProductDto) => {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description,
      price: String(product.price),
      discountPrice: product.discountPrice !== null ? String(product.discountPrice) : '',
      stock: String(product.stock),
      categoryId: String(product.categoryId),
      gender: product.gender,
      isBestseller: product.isBestseller,
      images: product.images.map((url, i) => ({
        id: `existing-${i}-${url}`,
        previewUrl: url,
        url,
        uploading: false,
        error: null,
      })),
    });
    setFieldErrors({});
    setFormErrors([]);
    setDrawerOpen(true);
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Укажите название товара.';
    if (!form.description.trim()) errors.description = 'Добавьте описание товара.';
    const price = Number(form.price);
    if (!form.price || Number.isNaN(price) || price <= 0) errors.price = 'Укажите цену больше нуля.';
    if (form.discountPrice) {
      const discount = Number(form.discountPrice);
      if (Number.isNaN(discount) || discount <= 0) errors.discountPrice = 'Некорректная цена со скидкой.';
      else if (!Number.isNaN(price) && discount >= price) errors.discountPrice = 'Цена со скидкой должна быть меньше обычной.';
    }
    const stock = Number(form.stock);
    if (form.stock === '' || Number.isNaN(stock) || stock < 0) errors.stock = 'Укажите остаток (0 или больше).';
    if (!form.categoryId) errors.categoryId = 'Выберите категорию.';
    if (form.images.length === 0) errors.images = 'Добавьте хотя бы одно изображение.';
    else if (form.images.some((img) => img.uploading)) errors.images = 'Дождитесь загрузки изображений.';
    return errors;
  };

  const handleSubmit = () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    setFormErrors([]);

    const request: ProductUpsertRequest = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      discountPrice: form.discountPrice ? Number(form.discountPrice) : null,
      stock: Number(form.stock),
      categoryId: Number(form.categoryId),
      gender: impliedGender(categories, form.categoryId) ?? form.gender,
      images: form.images.filter((img) => img.url).map((img) => img.url!),
      isBestseller: form.isBestseller,
    };

    const promise = form.id === null ? createAdminProduct(request) : updateAdminProduct(form.id, request);

    promise
      .then(() => {
        showToast(form.id === null ? 'Товар создан.' : 'Товар обновлён.');
        setDrawerOpen(false);
        loadProducts();
      })
      .catch((err: unknown) => {
        setFormErrors([err instanceof ApiError ? err.message : 'Не удалось сохранить товар.']);
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    deleteAdminProduct(pendingDelete.id)
      .then(() => {
        showToast('Товар удалён.');
        setPendingDelete(null);
        loadProducts();
      })
      .catch((err: unknown) => {
        showToast(err instanceof ApiError ? err.message : 'Не удалось удалить товар.', 'error');
      })
      .finally(() => setIsDeleting(false));
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters = categoryFilter !== 'all' || debouncedSearch !== '';

  return (
    <AdminLayout>
      <div className="admin-products">
        <header className="admin-products__header">
          <div>
            <h1>Товары</h1>
            <p>Каталог Family Shop: создание, редактирование и наличие товаров</p>
          </div>
          <button className="admin-products__add" onClick={openCreate}>
            <PlusIcon /> Добавить товар
          </button>
        </header>

        <div className="admin-products__toolbar">
          <input
            type="search"
            className="admin-orders__search"
            placeholder="Поиск по названию или описанию"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="admin-products__category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Все категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="admin-orders__view-toggle">
            <button className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')} aria-label="Табличный вид">
              <TableIcon />
            </button>
            <button className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')} aria-label="Карточный вид">
              <GridIcon />
            </button>
          </div>
        </div>

        {error && <p className="admin-page-error">{error}</p>}

        {!error && isLoading && (view === 'table' ? <TableSkeleton /> : <CardsSkeleton />)}

        {!error && !isLoading && products !== null && products.length === 0 && (
          <div className="admin-empty">
            <div className="admin-empty__icon">
              <ProductsEmptyIcon />
            </div>
            <h3>{hasFilters ? 'По этим фильтрам товаров не найдено' : 'Товаров пока нет'}</h3>
            <p>
              {hasFilters
                ? 'Попробуйте изменить категорию или поисковый запрос.'
                : 'Добавьте первый товар, чтобы он появился в каталоге.'}
            </p>
            {!hasFilters && (
              <button className="admin-products__add admin-products__add--empty" onClick={openCreate}>
                <PlusIcon /> Добавить товар
              </button>
            )}
          </div>
        )}

        {!error && !isLoading && products !== null && products.length > 0 && (
          <>
            {view === 'table' ? (
              <ProductsTable
                products={products}
                categoryById={categoryById}
                onEdit={openEdit}
                onDelete={setPendingDelete}
              />
            ) : (
              <ProductsCards
                products={products}
                categoryById={categoryById}
                onEdit={openEdit}
                onDelete={setPendingDelete}
              />
            )}

            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Назад
              </button>
              <span>
                Страница {page} из {totalPages} · {totalCount} товар(ов)
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Далее
              </button>
            </div>
          </>
        )}
      </div>

      <ProductFormDrawer
        open={drawerOpen}
        form={form}
        setForm={setForm}
        fieldErrors={fieldErrors}
        formErrors={formErrors}
        isSaving={isSaving}
        categories={categories}
        onSubmit={handleSubmit}
        onClose={() => setDrawerOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Удалить товар «${pendingDelete?.name}»?`}
        description="Это действие необратимо. Товары из истории заказов удалить нельзя."
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

function ProductsTable({
  products,
  categoryById,
  onEdit,
  onDelete,
}: {
  products: ProductDto[];
  categoryById: Map<number, CategoryDto>;
  onEdit: (product: ProductDto) => void;
  onDelete: (product: ProductDto) => void;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Товар</th>
            <th>Категория</th>
            <th>Цена</th>
            <th>Сток</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <div className="admin-products__row-product">
                  <img src={product.images[0]} alt="" className="admin-products__thumb" />
                  <div>
                    <div className="admin-products__row-name">
                      {product.name}
                      {product.isBestseller && <span className="admin-products__bestseller">Бестселлер</span>}
                    </div>
                  </div>
                </div>
              </td>
              <td>{categoryById.get(product.categoryId)?.name ?? '—'}</td>
              <td>
                <PriceCell product={product} />
              </td>
              <td>
                <StockCell stock={product.stock} />
              </td>
              <td>
                <div className="admin-categories__row-actions">
                  <button className="admin-table__expand" onClick={() => onEdit(product)}>
                    Изменить
                  </button>
                  <button className="admin-categories__delete" onClick={() => onDelete(product)}>
                    Удалить
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductsCards({
  products,
  categoryById,
  onEdit,
  onDelete,
}: {
  products: ProductDto[];
  categoryById: Map<number, CategoryDto>;
  onEdit: (product: ProductDto) => void;
  onDelete: (product: ProductDto) => void;
}) {
  return (
    <div className="admin-cards">
      {products.map((product) => (
        <div key={product.id} className="admin-product-card">
          <div className="admin-product-card__media">
            <img src={product.images[0]} alt="" />
            {product.isBestseller && <span className="admin-products__bestseller admin-products__bestseller--card">Бестселлер</span>}
          </div>
          <div className="admin-product-card__body">
            <span className="admin-product-card__category">{categoryById.get(product.categoryId)?.name ?? '—'}</span>
            <h3>{product.name}</h3>
            <PriceCell product={product} />
            <StockCell stock={product.stock} />
          </div>
          <div className="admin-product-card__actions">
            <button className="admin-table__expand" onClick={() => onEdit(product)}>
              Изменить
            </button>
            <button className="admin-categories__delete" onClick={() => onDelete(product)}>
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceCell({ product }: { product: ProductDto }) {
  if (product.discountPrice !== null) {
    return (
      <div className="admin-products__price">
        <span className="admin-products__price-old">{formatPrice(product.price)}</span>
        <span className="admin-products__price-new">{formatPrice(product.discountPrice)}</span>
      </div>
    );
  }
  return <span className="admin-products__price-new">{formatPrice(product.price)}</span>;
}

function StockCell({ stock }: { stock: number }) {
  if (stock === 0) return <span className="admin-products__stock is-out">Нет в наличии</span>;
  if (stock <= 5) return <span className="admin-products__stock is-low">Осталось {stock}</span>;
  return <span className="admin-products__stock">{stock} шт.</span>;
}

function ProductFormDrawer({
  open,
  form,
  setForm,
  fieldErrors,
  formErrors,
  isSaving,
  categories,
  onSubmit,
  onClose,
}: {
  open: boolean;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  fieldErrors: Record<string, string>;
  formErrors: string[];
  isSaving: boolean;
  categories: CategoryDto[];
  onSubmit: () => void;
  onClose: () => void;
}) {
  useLockBodyScroll(open);
  const categoryGender = impliedGender(categories, form.categoryId);

  return (
    <>
      <div className={`admin-drawer__backdrop ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`admin-drawer admin-drawer--wide ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        {open && (
          <>
            <div className="admin-drawer__header">
              <h2>{form.id === null ? 'Новый товар' : 'Изменить товар'}</h2>
              <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть">
                &times;
              </button>
            </div>

            <form
              className="admin-modal__form"
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <ImageDropzone
                images={form.images}
                error={fieldErrors.images}
                onChange={(images) => setForm((prev) => ({ ...prev, images }))}
              />

              <Field label="Название" error={fieldErrors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Например, Кашемировый свитер"
                />
              </Field>

              <div className="admin-form-row">
                <Field label="Категория" error={fieldErrors.categoryId} fullWidth={categoryGender !== undefined}>
                  <select
                    value={form.categoryId}
                    onChange={(e) => {
                      const categoryId = e.target.value;
                      const nextGender = impliedGender(categories, categoryId);
                      setForm((prev) => ({
                        ...prev,
                        categoryId,
                        gender: nextGender ?? prev.gender,
                      }));
                    }}
                  >
                    <option value="">Выберите категорию</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {categoryGender === undefined && (
                  <Field label="Пол">
                    <select
                      value={form.gender}
                      onChange={(e) => setForm((prev) => ({ ...prev, gender: Number(e.target.value) as ApiGender }))}
                    >
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {GENDER_LABEL[g]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <div className="admin-form-row">
                <Field label="Цена, ₸" error={fieldErrors.price}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                    placeholder="24990"
                  />
                </Field>

                <Field label="Цена со скидкой, ₸" error={fieldErrors.discountPrice}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.discountPrice}
                    onChange={(e) => setForm((prev) => ({ ...prev, discountPrice: e.target.value }))}
                    placeholder="Необязательно"
                  />
                </Field>
              </div>

              <Field label="Остаток на складе" error={fieldErrors.stock}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                  placeholder="0"
                />
              </Field>

              <Field label="Описание" error={fieldErrors.description}>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Материалы, посадка, уход за изделием..."
                />
              </Field>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={form.isBestseller}
                  onChange={(e) => setForm((prev) => ({ ...prev, isBestseller: e.target.checked }))}
                />
                <span>Бестселлер</span>
              </label>

              {formErrors.length > 0 && (
                <div className="admin-form-errors">
                  {formErrors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
              )}

              <div className="admin-modal__actions admin-drawer__form-actions">
                <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={isSaving}>
                  Отмена
                </button>
                <button type="submit" className="confirm-dialog__confirm" disabled={isSaving}>
                  {isSaving ? <span className="confirm-dialog__spinner" /> : 'Сохранить товар'}
                </button>
              </div>
            </form>
          </>
        )}
      </aside>
    </>
  );
}

function Field({
  label,
  error,
  fullWidth,
  children,
}: {
  label: string;
  error?: string;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`admin-form-field ${error ? 'has-error' : ''} ${fullWidth ? 'is-full' : ''}`}>
      <span>{label}</span>
      {children}
      {error && <span className="admin-form-field__error">{error}</span>}
    </label>
  );
}

function ImageDropzone({
  images,
  error,
  onChange,
}: {
  images: ImageSlot[];
  error?: string;
  onChange: (images: ImageSlot[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Uploads resolve asynchronously and out of order, so slot updates always read
  // the latest images array through this ref rather than the closed-over prop.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const updateSlot = (id: string, updater: (img: ImageSlot) => ImageSlot) => {
    onChange(imagesRef.current.map((img) => (img.id === id ? updater(img) : img)));
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newSlots: ImageSlot[] = Array.from(files).map((file) => ({
      id: `upload-${crypto.randomUUID()}`,
      previewUrl: URL.createObjectURL(file),
      url: null,
      uploading: true,
      error: null,
    }));

    onChange([...images, ...newSlots]);

    newSlots.forEach((slot, i) => {
      const file = files[i];
      uploadAdminProductImage(file)
        .then((url) => {
          updateSlot(slot.id, (img) => ({ ...img, url, uploading: false }));
        })
        .catch((err: unknown) => {
          updateSlot(slot.id, (img) => ({
            ...img,
            uploading: false,
            error: err instanceof ApiError ? err.message : 'Не удалось загрузить изображение.',
          }));
        });
    });
  };

  const removeImage = (id: string) => {
    onChange(images.filter((img) => img.id !== id));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="admin-form-field has-error-wrap">
      <span className="admin-form-field__label-standalone">Изображения</span>
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
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {images.length > 0 && (
        <div className="admin-dropzone__previews">
          {images.map((img) => (
            <div key={img.id} className={`admin-dropzone__preview ${img.error ? 'has-error' : ''}`}>
              <img src={img.previewUrl} alt="" />
              {img.uploading && <span className="admin-dropzone__spinner" />}
              {img.error && <span className="admin-dropzone__preview-error">{img.error}</span>}
              <button
                type="button"
                className="admin-dropzone__remove"
                onClick={() => removeImage(img.id)}
                aria-label="Удалить изображение"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <span className="admin-form-field__error">{error}</span>}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Товар</th>
            <th>Категория</th>
            <th>Цена</th>
            <th>Сток</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: 5 }).map((__, j) => (
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

function CardsSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-product-card">
          <span className="skeleton" style={{ height: 200, width: '100%', marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
          <span className="skeleton" style={{ height: 14, width: '40%' }} />
        </div>
      ))}
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

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 15V4m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ProductsEmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M8 13 20 6l12 7v14l-12 7-12-7V13Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13l12 7m0 0 12-7m-12 7v14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
