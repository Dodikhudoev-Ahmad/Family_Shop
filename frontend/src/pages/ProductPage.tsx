import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Gender } from '../types/product';
import { useProducts } from '../context/ProductsContext';
import { useCategories } from '../context/CategoriesContext';
import { Breadcrumbs } from '../components/Breadcrumbs/Breadcrumbs';
import { useSeo } from '../hooks/useSeo';
import { SITE_NAME, truncateDescription } from '../data/seo';
import { formatPrice } from '../utils/formatPrice';
import { isLowStock, isOutOfStock } from '../utils/stock';
import { ProductCard } from '../components/ProductCard/ProductCard';
import { Slider } from '../components/Slider/Slider';
import { Accordion } from '../components/Accordion/Accordion';
import { Button } from '../components/Button/Button';
import { FadeImage } from '../components/FadeImage/FadeImage';
import { StarRating } from '../components/StarRating/StarRating';
import { ProductReviews } from '../components/Reviews/ProductReviews';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import './ProductPage.css';

export function ProductPage() {
  const { id } = useParams();
  const { products, isLoading } = useProducts();
  const { categories } = useCategories();
  const product = products.find((p) => p.id === id);
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { showToast } = useToast();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useSeo({
    title: product ? `${product.name} — ${SITE_NAME}` : SITE_NAME,
    description: product ? truncateDescription(product.description) : 'Товар не найден.',
    image: product?.images[0],
    type: 'product',
  });

  if (isLoading) {
    return <div className="container product-page__not-found">Загрузка...</div>;
  }

  if (!product) {
    return (
      <div className="container product-page__not-found">
        <p>Товар не найден.</p>
        <Link to="/">На главную</Link>
      </div>
    );
  }

  const related = products.filter((p) => p.categoryId === product.categoryId && p.id !== product.id).slice(0, 8);
  const productCategory = categories.find((c) => c.id === product.categoryId);
  const favorite = isFavorite(product.id);
  const outOfStock = isOutOfStock(product.stock);
  const lowStock = isLowStock(product.stock);

  const handleAddToCart = () => {
    if (!selectedSize) {
      showToast('Пожалуйста, выберите размер', 'error');
      return;
    }
    addItem(product, selectedSize, quantity);
  };

  return (
    <div className="container product-page">
      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          ...(productCategory ? [{ label: productCategory.name, href: `/catalog/${productCategory.slug}` }] : []),
          { label: product.name },
        ]}
      />
      <div className="product-page__layout">
        <div className="product-page__gallery">
          <div className="product-page__main-image">
            <FadeImage src={product.images[activeImage]} alt={product.name} />
          </div>
          <div className="product-page__thumbs">
            {product.images.map((img, i) => (
              <button
                key={img}
                className={`product-page__thumb ${activeImage === i ? 'is-active' : ''}`}
                onClick={() => setActiveImage(i)}
                aria-label={`Фото ${i + 1}`}
              >
                <FadeImage src={img} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="product-page__details">
          <span className="product-page__category">{categoryLabel(product.gender)}</span>
          <h1 className="product-page__name">{product.name}</h1>
          {product.reviewCount > 0 && (
            <div className="product-page__rating">
              <StarRating value={product.averageRating} size="sm" />
              <span>
                {product.averageRating.toFixed(1)} · {product.reviewCount} отзыв(ов)
              </span>
            </div>
          )}
          <div className="product-page__price">
            {product.discountPrice && <span className="product-page__price-old">{formatPrice(product.price)}</span>}
            <span className={product.discountPrice ? 'product-page__price-new' : ''}>
              {formatPrice(product.discountPrice ?? product.price)}
            </span>
          </div>
          {lowStock && <span className="product-page__stock-warning">Осталось {product.stock} шт</span>}
          {outOfStock && <span className="product-page__stock-warning product-page__stock-warning--out">Нет в наличии</span>}

          <div className="product-page__block">
            <span className="product-page__block-title">Размер</span>
            <div className="product-page__sizes">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  className={`size-btn ${selectedSize === size ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {!outOfStock && (
            <div className="product-page__block">
              <span className="product-page__block-title">Количество</span>
              <div className="quantity-stepper">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Уменьшить количество">
                  −
                </button>
                <span>{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock}
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="product-page__actions">
            <Button
              variant="primary"
              size="lg"
              className="product-page__add-btn"
              onClick={handleAddToCart}
              disabled={outOfStock}
            >
              {outOfStock ? 'Нет в наличии' : 'В корзину'}
            </Button>
            <button
              className={`product-page__fav-btn ${favorite ? 'is-active' : ''}`}
              aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
              onClick={() => toggleFavorite(product.id, product.name)}
            >
              <HeartIcon filled={favorite} />
            </button>
          </div>

          <div className="product-page__accordions">
            <Accordion title="Описание" defaultOpen>
              <p>{product.description}</p>
            </Accordion>
            <Accordion title="Доставка и возврат">
              <p>Доставка курьером 2-4 дня или самовывоз из пункта выдачи. Возврат в течение 14 дней с сохранением бирок.</p>
            </Accordion>
            <Accordion title="Состав и уход">
              <p>Состав уточняется на бирке изделия. Рекомендуется деликатная стирка при 30°C.</p>
            </Accordion>
          </div>
        </div>
      </div>

      <ProductReviews productId={Number(product.id)} />

      {related.length > 0 && (
        <section className="product-page__related">
          <h3 className="home-section__title">Похожие товары</h3>
          <Slider>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </Slider>
        </section>
      )}
    </div>
  );
}

function categoryLabel(gender: Gender) {
  switch (gender) {
    case 'female':
      return 'Женское';
    case 'male':
      return 'Мужское';
    case 'kids':
      return 'Детское';
  }
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M10 17.5s-7-4.35-7-9.5A4 4 0 0 1 10 5.5 4 4 0 0 1 17 8c0 5.15-7 9.5-7 9.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
