import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import i18n from '../src/i18n';
import { buildProductQuery, initialFilters, isOfferedSort, SORT_OPTIONS } from '../src/lib/catalog/catalogFilters';
import { CatalogScreen } from '../src/screens/CatalogScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';

const mockQueries: unknown[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../src/components/FilterSheet', () => ({ FilterSheet: () => null }));
jest.mock('../src/components/ProductCard', () => ({ ProductCard: () => null, useGridCardWidth: () => 150 }));
jest.mock('../src/hooks/useSmartHeader', () => ({
  useSmartHeader: () => ({ translateY: 0, height: 0, onLayout: jest.fn(), onScroll: jest.fn(), setOverlayOpen: jest.fn() }),
}));
jest.mock('../src/state/ProductsContext', () => ({ useProducts: () => ({ isLoading: false, error: null, products: [], reload: jest.fn() }) }));
jest.mock('../src/state/CategoriesContext', () => ({ useCategories: () => ({ categories: [], isLoading: false }) }));
jest.mock('../src/state/useCatalogPages', () => ({
  useCatalogPages: (_key: string, build: (page: number) => unknown) => {
    mockQueries.push(build(1));
    return { items: [], hasMore: false, loading: false, failed: false, page: 1, loadMore: jest.fn(), reload: jest.fn(), retry: jest.fn() };
  },
}));

const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()!.unmount());
});
beforeEach(async () => {
  mockQueries.length = 0;
  await i18n.changeLanguage('ru');
});

const screenProps = (params?: Record<string, unknown>) => ({ navigation: { navigate: jest.fn() }, route: { key: 'c', name: 'Catalog', params } }) as unknown;

async function show(params?: Record<string, unknown>) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <CatalogScreen {...(screenProps(params) as ComponentProps<typeof CatalogScreen>)} />
      </ThemeProvider>
    );
  });
  mounted.push(tree);
  return tree;
}

const field = (tree: ReturnType<typeof create>) => tree.root.find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(i18n.t('mobile.sort')) && typeof n.props.onPress === 'function');
const press = (node: ReactTestInstance) => act(async () => node.props.onPress());
const options = (tree: ReturnType<typeof create>) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');
const lastQuery = () => mockQueries[mockQueries.length - 1] as { sortBy?: number };

describe('sort in the catalogue (query)', () => {
  const shop = [] as never[];
  const query = (sort: Parameters<typeof buildProductQuery>[2]) => buildProductQuery(initialFilters(shop, null), [0, 0], sort, null, 1);

  it('offers only the two price orders', () => {
    expect([...SORT_OPTIONS]).toEqual(['price-asc', 'price-desc']);
    expect(isOfferedSort('price-desc')).toBe(true);
    expect(isOfferedSort('new')).toBe(false);
    expect(isOfferedSort('popular')).toBe(false);
    expect(isOfferedSort(null)).toBe(false);
  });

  it('sends no sortBy when nothing is chosen (the server default), and still maps every order the API knows', () => {
    expect(query(null).sortBy).toBeUndefined();
    expect(query('new').sortBy).toBe(0);
    expect(query('price-asc').sortBy).toBe(1);
    expect(query('price-desc').sortBy).toBe(2);
    expect(query('popular').sortBy).toBe(3);
  });
});

describe('CatalogScreen sort field', () => {
  it('starts with the "Сортировка" placeholder and the default server order', async () => {
    const tree = await show();

    expect(field(tree).props.accessibilityLabel).toBe('Сортировка');
    expect(lastQuery().sortBy).toBeUndefined();
  });

  it('lists exactly the two price options; choosing one applies it and shows it', async () => {
    const tree = await show();
    await press(field(tree));

    expect(options(tree).map((o) => o.props.accessibilityLabel)).toEqual(['Цена: по возрастанию', 'Цена: по убыванию']);

    await press(options(tree)[1]);
    expect(lastQuery().sortBy).toBe(2);
    expect(field(tree).props.accessibilityLabel).toBe('Сортировка: Цена: по убыванию');
  });

  it('choosing the active option again goes back to the default order and the placeholder', async () => {
    const tree = await show();
    await press(field(tree));
    await press(options(tree)[0]);
    expect(lastQuery().sortBy).toBe(1);

    await press(field(tree));
    expect(options(tree)[0].props.accessibilityState.selected).toBe(true);
    await press(options(tree)[0]);

    expect(lastQuery().sortBy).toBeUndefined();
    expect(field(tree).props.accessibilityLabel).toBe('Сортировка');
  });

  it('an order that is not offered ("See all" under Bestsellers) is applied, but the field shows the placeholder', async () => {
    const tree = await show({ sort: 'popular' });

    expect(lastQuery().sortBy).toBe(3);
    expect(field(tree).props.accessibilityLabel).toBe('Сортировка');
    await press(field(tree));
    expect(options(tree).every((o) => o.props.accessibilityState.selected === false)).toBe(true);
  });

  it('a price order from outside is shown as chosen', async () => {
    const tree = await show({ sort: 'price-asc' });

    expect(lastQuery().sortBy).toBe(1);
    expect(field(tree).props.accessibilityLabel).toBe('Сортировка: Цена: по возрастанию');
  });

  it('has no leftover texts for the removed options in any language', async () => {
    for (const lang of ['ru', 'kk', 'en']) {
      await i18n.changeLanguage(lang);
      expect(i18n.exists('catalog.sortNew')).toBe(false);
      expect(i18n.exists('catalog.sortPopular')).toBe(false);
      expect(i18n.exists('mobile.sort')).toBe(true);
    }
    void Text;
  });
});
