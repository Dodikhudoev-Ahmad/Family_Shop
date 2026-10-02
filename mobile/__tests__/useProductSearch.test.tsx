import { act, create } from 'react-test-renderer';
import type { PagedResult, ProductDto } from '../src/lib/api/types';
import { SEARCH_DEBOUNCE_MS, useProductSearch } from '../src/state/useProductSearch';

const mockFetch = jest.fn<Promise<PagedResult<ProductDto>>, [{ search?: string; pageSize?: number }]>();
jest.mock('../src/lib/api/endpoints', () => ({ fetchProductsPage: (q: { search?: string; pageSize?: number }) => mockFetch(q) }));

const dto = (id: number, name: string): ProductDto => ({
  id, name, description: '', price: 100, discountPrice: null, stock: 3, categoryId: 1, gender: 1,
  images: [], createdAt: '2026-01-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0, productType: null,
});
const page = (items: ProductDto[]): PagedResult<ProductDto> => ({ items, totalCount: items.length, page: 1, pageSize: 20, hasMore: false });

type Hook = ReturnType<typeof useProductSearch>;
function mount(initial: string) {
  const ref: { current: Hook | null } = { current: null };
  const Probe = ({ q }: { q: string }) => {
    ref.current = useProductSearch(q, []);
    return null;
  };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Probe q={initial} />);
  });
  return { ref, type: (q: string) => act(() => tree.update(<Probe q={q} />)) };
}
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('useProductSearch', () => {
  it('does nothing for empty or blank input', async () => {
    const { ref } = mount('   ');
    await advance(1000);
    expect(ref.current?.status).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('waits for the typing to pause: one request for a burst of keystrokes, with the trimmed text', async () => {
    mockFetch.mockResolvedValue(page([dto(1, 'Худи серое')]));
    const { ref, type } = mount('х');
    await advance(100);
    type('ху');
    await advance(100);
    type('  худи ');
    expect(ref.current?.status).toBe('loading');
    await advance(SEARCH_DEBOUNCE_MS - 1);
    expect(mockFetch).not.toHaveBeenCalled();
    await advance(5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toMatchObject({ search: 'худи' });
    expect(ref.current?.status).toBe('done');
    expect(ref.current?.results.map((p) => p.name)).toEqual(['Худи серое']);
  });

  it('"nothing found" only appears after the answer for the current text has arrived', async () => {
    let release!: (p: PagedResult<ProductDto>) => void;
    mockFetch.mockImplementation(() => new Promise((res) => { release = res; }));
    const { ref } = mount('плащ');
    expect(ref.current?.status).toBe('loading'); // typing / debounce
    await advance(SEARCH_DEBOUNCE_MS + 10);
    expect(ref.current?.status).toBe('loading'); // request in flight - still not "nothing found"
    await act(async () => { release(page([])); await Promise.resolve(); });
    expect(ref.current?.status).toBe('done');
    expect(ref.current?.results).toEqual([]);
  });

  it('ignores a slow answer for an older text', async () => {
    const releases: ((p: PagedResult<ProductDto>) => void)[] = [];
    mockFetch.mockImplementation(() => new Promise((res) => { releases.push(res); }));
    const { ref, type } = mount('a');
    await advance(SEARCH_DEBOUNCE_MS + 1); // request for "a" in flight
    type('ab');
    await advance(SEARCH_DEBOUNCE_MS + 1); // request for "ab" in flight
    await act(async () => { releases[1](page([dto(2, 'ab-result')])); await Promise.resolve(); });
    await act(async () => { releases[0](page([dto(1, 'a-result')])); await Promise.resolve(); });
    expect(ref.current?.results.map((p) => p.name)).toEqual(['ab-result']);
  });

  it('reports a failure (not "nothing found") and can retry', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([dto(1, 'Худи')]));
    const { ref } = mount('худи');
    await advance(SEARCH_DEBOUNCE_MS + 5);
    expect(ref.current?.status).toBe('error');
    act(() => ref.current?.retry());
    await advance(SEARCH_DEBOUNCE_MS + 5);
    expect(ref.current?.status).toBe('done');
    expect(ref.current?.results).toHaveLength(1);
  });

  it('clearing the box returns to idle and forgets the results', async () => {
    mockFetch.mockResolvedValue(page([dto(1, 'Худи')]));
    const { ref, type } = mount('худи');
    await advance(SEARCH_DEBOUNCE_MS + 5);
    type('');
    expect(ref.current?.status).toBe('idle');
    expect(ref.current?.results).toEqual([]);
  });
});
