import { Text } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import i18n from '../src/i18n';
import { ProductScreen } from '../src/screens/ProductScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';

const mockFetchProduct = jest.fn();
const mockAddItem = jest.fn().mockReturnValue({ added: 1, limit: null });

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/lib/api/endpoints', () => ({ fetchProduct: (...a: unknown[]) => mockFetchProduct(...a) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }) }));
jest.mock('../src/components/ProductReviews', () => ({ ProductReviews: () => null }));
jest.mock('../src/components/ProductGridSection', () => ({ ProductGridSection: () => null }));
jest.mock('../src/state/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
      { id: '4', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
    ],
  }),
}));
jest.mock('../src/state/ProductsContext', () => ({ useProducts: () => ({ products: [] }) }));
jest.mock('../src/state/CartContext', () => ({ useCart: () => ({ lines: [], addItem: mockAddItem }) }));
jest.mock('../src/state/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: jest.fn() }) }));

const dto = (over: Record<string, unknown>) => ({
  id: 7, name: 'Худи оверсайз', description: 'Описание', price: 9000, discountPrice: null, stock: 5, categoryId: 1, gender: 1,
  images: ['a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: 'Худи', availableSizes: null, ...over,
});

const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()!.unmount());
});
beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('ru');
});

async function show(product: Record<string, unknown>) {
  mockFetchProduct.mockResolvedValue(product);
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <ProductScreen route={{ key: 'p', name: 'Product', params: { productId: 7 } } as never} />
      </ThemeProvider>
    );
  });
  mounted.push(tree);
  return tree;
}

const sizes = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel);

describe('ProductScreen - sizes', () => {
  it('offers only the sizes the admin sells', async () => {
    expect(sizes(await show(dto({ availableSizes: ['M', 'L'] })))).toEqual(['M', 'L']);
  });

  it('offers the whole grid of the type when no selection was made (existing products)', async () => {
    expect(sizes(await show(dto({ availableSizes: null })))).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
  });

  it('asks for a size first, then adds with that size', async () => {
    const tree = await show(dto({ availableSizes: ['M', 'L'] }));
    const press = (label: string) => act(async () => tree.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').props.onPress());

    await press(i18n.t('common.addToCart'));
    expect(mockAddItem).not.toHaveBeenCalled();

    await press('L');
    await press(i18n.t('common.addToCart'));
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }), 'L', 1);
  });

  it('shows no size selector for a product without sizes and adds it without a size', async () => {
    const tree = await show(dto({ id: 8, name: 'Холодильник', categoryId: 4, productType: 'Холодильники' }));

    expect(sizes(tree)).toEqual([]);
    const texts = tree.root.findAllByType(Text).map((n) => n.children.join(''));
    expect(texts).not.toContain(i18n.t('product.size'));

    await act(async () => tree.root.find((n) => n.props.accessibilityLabel === i18n.t('common.addToCart') && typeof n.props.onPress === 'function').props.onPress());
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: '8' }), null, 1);
  });
});
