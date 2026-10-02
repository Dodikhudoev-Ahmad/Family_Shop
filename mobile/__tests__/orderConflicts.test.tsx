import { act, create, type ReactTestInstance } from 'react-test-renderer';
import i18n from '../src/i18n';
import { createApiClient } from '../src/lib/api/client';
import { ApiError } from '../src/lib/api/errors';
import { createTokenStore } from '../src/lib/api/tokenStore';
import { createDeviceIdProvider } from '../src/lib/deviceId';
import { isOrderConflict, outOfStockInfo, outOfStockMessage } from '../src/lib/orderErrors';
import { CheckoutScreen } from '../src/screens/CheckoutScreen';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { jsonResponse, memorySecretStore } from '../test-utils/auth';

const mockCreateOrder = jest.fn();
const mockClear = jest.fn();
const mockReload = jest.fn().mockResolvedValue(undefined);
let mockLines: unknown[] = [];
const mounted: ReturnType<typeof create>[] = [];

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/lib/api/endpoints', () => ({ createOrder: (...a: unknown[]) => mockCreateOrder(...a) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ popToTop: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }) }));
jest.mock('../src/state/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Аня' }, isLoading: false }) }));
jest.mock('../src/state/ProductsContext', () => ({ useProducts: () => ({ reload: mockReload }) }));
jest.mock('../src/state/CartContext', () => ({
  useCart: () => ({ lines: mockLines, totalPrice: 10000, finalTotal: 10000, promo: null, clear: mockClear }),
}));
jest.mock('../src/components/forms', () => {
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    PromoCodeInput: () => null,
    TextField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) =>
      createElement(TextInput, { accessibilityLabel: label, value, onChangeText }),
  };
});

const line = { key: '7__onesize', productId: '7', name: 'Куртка', price: 10000, size: null, quantity: 1, stock: 1 };

const shortage = (available: number) =>
  new ApiError(409, "Insufficient stock for product 'Куртка'.", {
    code: 'out_of_stock',
    meta: { productId: 7, productName: 'Куртка', available },
  });

afterEach(() => {
  while (mounted.length) {
    const tree = mounted.pop()!;
    act(() => tree.unmount());
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockLines = [line];
  await i18n.changeLanguage('ru');
});

describe('the API client keeps code and meta of a 409', () => {
  it('turns an out_of_stock envelope into an ApiError carrying them', async () => {
    const store = memorySecretStore();
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      tokens: createTokenStore(store),
      getDeviceId: createDeviceIdProvider(store, () => '11111111-2222-3333-4444-555555555555'),
      fetchImpl: (() =>
        Promise.resolve(
          jsonResponse(409, {
            success: false,
            data: null,
            errors: ["Insufficient stock for product 'Куртка'."],
            code: 'out_of_stock',
            meta: { productId: 7, productName: 'Куртка', available: 2 },
          })
        )) as unknown as typeof fetch,
      now: () => 0,
      deviceName: 'Test',
    });

    const err = await client.request('/orders', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(outOfStockInfo(err)).toEqual({ productId: 7, productName: 'Куртка', available: 2 });
    expect(isOrderConflict(err)).toBe(false);
    expect(outOfStockInfo(new ApiError(400, 'bad'))).toBeNull();
    expect(isOrderConflict(new ApiError(409, 'x', { code: 'conflict' }))).toBe(true);
  });
});

describe('out-of-stock message', () => {
  it.each([
    ['ru', 'Товара «Куртка» не хватает на складе, осталось 2'],
    ['en', 'Not enough of “Куртка” in stock, only 2 left'],
    ['kk', '«Куртка» тауары қоймада жеткіліксіз, 2 дана қалды'],
  ])('names the product and the remaining quantity in %s', async (lang, expected) => {
    await i18n.changeLanguage(lang);
    expect(outOfStockMessage({ productId: 7, productName: 'Куртка', available: 2 }, i18n.t.bind(i18n))).toContain(expected);
  });
});

describe('CheckoutScreen on 409 out_of_stock', () => {
  const textOf = (node: ReactTestInstance): string =>
    node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

  async function submit(error: ApiError) {
    mockCreateOrder.mockRejectedValue(error);
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <ThemeProvider>
          <CheckoutScreen />
        </ThemeProvider>
      );
    });
    mounted.push(tree);
    const byLabel = (label: string) => tree.root.find((n) => n.props.accessibilityLabel === label && typeof (n.props.onChangeText ?? n.props.onPress) === 'function');
    await act(async () => byLabel(i18n.t('checkout.phone')).props.onChangeText('7001234567'));
    await act(async () => byLabel(i18n.t('checkout.pickup')).props.onPress());
    await act(async () => byLabel(i18n.t('checkout.confirm')).props.onPress());
    return tree;
  }

  it('shows the product and what is left, keeps the cart, reloads stock and does not show success', async () => {
    const tree = await submit(shortage(3));
    const alert = tree.root.find((n) => n.props.accessibilityRole === 'alert');

    expect(textOf(alert)).toContain('Товара «Куртка» не хватает на складе, осталось 3');
    expect(textOf(alert)).not.toContain('Insufficient');
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tree.toJSON())).not.toContain(i18n.t('checkout.successTitle'));
  });

  it('still explains the shortage when the cart reconciles itself to empty afterwards', async () => {
    const tree = await submit(shortage(0));
    mockLines = []; // what reconcileCart does once the reloaded catalogue says "sold out"
    await act(async () => tree.update(<ThemeProvider><CheckoutScreen /></ThemeProvider>));

    expect(JSON.stringify(tree.toJSON())).toContain('закончился');
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('other failures keep their text and do not reload the catalogue', async () => {
    const tree = await submit(new ApiError(400, 'Промокод не найден.'));
    expect(textOf(tree.root.find((n) => n.props.accessibilityRole === 'alert'))).toContain('Промокод не найден.');
    expect(mockReload).not.toHaveBeenCalled();
  });
});
