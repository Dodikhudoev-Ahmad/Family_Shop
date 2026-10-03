import { StyleSheet, Text } from 'react-native';
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
      { id: '3', name: 'Детское', slug: 'kids', hasSizes: true },
      { id: '4', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
    ],
  }),
}));
let mockKnown: unknown[] = [];
jest.mock('../src/state/ProductsContext', () => ({ useProducts: () => ({ products: mockKnown }) }));
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
  mockKnown = [];
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

const radios = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');
const valueOf = (radio: ReactTestInstance) => String(radio.findByType(Text).props.children);
const values = (tree: ReturnType<typeof create>) => radios(tree).map(valueOf);
const unavailable = (tree: ReturnType<typeof create>) => radios(tree).filter((r) => r.props.accessibilityState.disabled).map(valueOf);
const radio = (tree: ReturnType<typeof create>, value: string) => radios(tree).find((r) => valueOf(r) === value)!;
const note = (tree: ReturnType<typeof create>) =>
  String(tree.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite' && n.type === Text)[0].props.children);
const addButton = (tree: ReturnType<typeof create>) =>
  tree.root.find((n) => n.props.accessibilityLabel === i18n.t('common.addToCart') && typeof n.props.onPress === 'function');
const press = (node: ReactTestInstance) => act(async () => node.props.onPress());

describe('ProductScreen - sizes', () => {
  it('shows the whole grid of the type and marks the sizes the admin does not sell', async () => {
    const tree = await show(dto({ availableSizes: ['M', 'L'] }));

    expect(values(tree)).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']); // nothing is hidden
    expect(unavailable(tree)).toEqual(['S', 'XL', '2XL', '3XL', '4XL']);
    const xl = radio(tree, 'XL');
    expect(xl.props.accessibilityLabel).toBe('XL, недоступен');
    expect(xl.props.disabled).toBeFalsy(); // not `disabled`: stays focusable and pressable
    expect(StyleSheet.flatten(xl.findByType(Text).props.style).textDecorationLine).toBe('line-through');
    expect(StyleSheet.flatten(radio(tree, 'M').findByType(Text).props.style).textDecorationLine).toBeUndefined();
  });

  it('children\'s shoes with 27, 28 and 30 withdrawn still show 26-35', async () => {
    const tree = await show(dto({ id: 9, categoryId: 3, productType: 'Ботинки', availableSizes: ['26', '29', '31', '32', '33', '34', '35'] }));

    expect(values(tree)).toEqual(['26', '27', '28', '29', '30', '31', '32', '33', '34', '35']);
    expect(unavailable(tree)).toEqual(['27', '28', '30']);
  });

  it('pressing an unavailable size selects nothing, explains why, and keeps "В корзину" inactive', async () => {
    const tree = await show(dto({ availableSizes: ['M', 'L'] }));
    expect(note(tree)).toBe('');

    await press(radio(tree, 'XL'));

    expect(radios(tree).every((r) => !r.props.accessibilityState.selected)).toBe(true);
    expect(note(tree)).toBe('Размер XL сейчас недоступен. Выберите другой.');
    expect(addButton(tree).props.accessibilityState.disabled).toBe(true);
    await press(addButton(tree));
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it('the explanation goes away after about four seconds, and when another size is chosen', async () => {
    jest.useFakeTimers();
    try {
      const tree = await show(dto({ availableSizes: ['M', 'L'] }));

      await press(radio(tree, 'S'));
      expect(note(tree)).toContain('Размер S');
      await act(async () => jest.advanceTimersByTime(3900));
      expect(note(tree)).toContain('Размер S');
      await act(async () => jest.advanceTimersByTime(200));
      expect(note(tree)).toBe('');

      await press(radio(tree, 'XL'));
      expect(note(tree)).toContain('Размер XL');
      await press(radio(tree, 'M'));
      expect(note(tree)).toBe('');
      expect(radio(tree, 'M').props.accessibilityState.selected).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('an available size is selected, activates "В корзину" and is added with exactly that size', async () => {
    const tree = await show(dto({ availableSizes: ['M', 'L'] }));
    expect(addButton(tree).props.accessibilityState.disabled).toBe(true);

    await press(radio(tree, 'L'));
    expect(addButton(tree).props.accessibilityState.disabled).toBe(false);
    await press(addButton(tree));

    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }), 'L', 1);
  });

  it('AvailableSizes = null: every size of the grid is available (existing products)', async () => {
    const tree = await show(dto({ availableSizes: null }));

    expect(values(tree)).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(unavailable(tree)).toEqual([]);
  });

  it('shows no size selector for a product without sizes and adds it without a size', async () => {
    const tree = await show(dto({ id: 8, name: 'Холодильник', categoryId: 4, productType: 'Холодильники' }));

    expect(values(tree)).toEqual([]);
    const texts = tree.root.findAllByType(Text).map((n) => n.children.join(''));
    expect(texts).not.toContain(i18n.t('product.size'));
    expect(addButton(tree).props.accessibilityState.disabled).toBe(false);

    await press(addButton(tree));
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: '8' }), null, 1);
  });

  it('falls back to the available sizes when gridSizes is missing (old snapshot) or null', async () => {
    for (const gridSizes of [undefined, null]) {
      // The already-loaded catalogue entry is shown at once; the refresh from the API fails, so it stays on screen.
      mockKnown = [{ id: '7', name: 'Худи', description: '', price: 9000, stock: 5, categoryId: '1', gender: 'female', images: ['a.jpg'], sizes: ['M', 'L'], gridSizes, productType: 'Худи', createdAt: '2026-09-01T00:00:00Z', averageRating: 0, reviewCount: 0 }];
      mockFetchProduct.mockRejectedValue(new Error('offline'));
      let tree!: ReturnType<typeof create>;
      await act(async () => {
        tree = create(
          <ThemeProvider>
            <ProductScreen route={{ key: 'p', name: 'Product', params: { productId: 7 } } as never} />
          </ThemeProvider>
        );
      });
      mounted.push(tree);

      expect(values(tree)).toEqual(['M', 'L']); // only what can be bought, as before gridSizes existed
      expect(unavailable(tree)).toEqual([]);
      await press(radio(tree, 'L'));
      expect(addButton(tree).props.accessibilityState.disabled).toBe(false);
      act(() => mounted.pop()!.unmount());
    }
  });
});
