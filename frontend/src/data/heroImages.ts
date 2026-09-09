// Статичные маркетинговые изображения для hero-плиток главной страницы.
// Не являются карточками товаров, поэтому не приходят из API — подобраны и
// визуально проверены вручную (см. отчёт), в отличие от каталога товаров.
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&h=1100&fit=crop&q=80`;

export const heroImages: Record<'women' | 'men' | 'kids', string> = {
  women: img('1662532577856-e8ee8b138a8b'),
  men: img('1519085360753-af0119f7cbe7'),
  kids: img('1624272949900-9ae4c56397e8'),
};
