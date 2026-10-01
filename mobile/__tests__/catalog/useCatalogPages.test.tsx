import { act, create } from 'react-test-renderer';
import type { PagedResult, ProductDto } from '../../src/lib/api/types';
import { useCatalogPages } from '../../src/state/useCatalogPages';

const mockFetch = jest.fn<Promise<PagedResult<ProductDto>>, [{ page?: number; search?: string }]>();
jest.mock('../../src/lib/api/endpoints', () => ({ fetchProductsPage: (q: { page?: number; search?: string }) => mockFetch(q) }));

const dto = (id: number): ProductDto => ({
  id, name: `p${id}`, description: '', price: 100, discountPrice: null, stock: 3, categoryId: 1, gender: 1,
  images: [], createdAt: '2026-01-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0, productType: null,
});
const page = (ids: number[], hasMore: boolean, n = 1): PagedResult<ProductDto> => ({ items: ids.map(dto), totalCount: 99, page: n, pageSize: ids.length, hasMore });

type Hook = ReturnType<typeof useCatalogPages>;
function mount(initialKey: string) {
  const ref: { current: Hook | null } = { current: null };
  const Probe = ({ k }: { k: string }) => {
    ref.current = useCatalogPages(k, (p) => ({ page: p, search: k }), []);
    return null;
  };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Probe k={initialKey} />);
  });
  return { ref, rerender: (k: string) => act(() => tree.update(<Probe k={k} />)) };
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => mockFetch.mockReset());

describe('useCatalogPages', () => {
  it('loads page 1, then appends page 2 without duplicates, and never requests a page twice at once', async () => {
    mockFetch.mockResolvedValueOnce(page([1, 2], true)).mockResolvedValueOnce(page([2, 3], false, 2));
    const { ref } = mount('a');
    await flush();
    expect(ref.current?.items.map((p) => p.id)).toEqual(['1', '2']);
    expect(ref.current?.hasMore).toBe(true);

    act(() => {
      ref.current?.loadMore();
      ref.current?.loadMore(); // onEndReached firing twice in a row
    });
    await flush();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(ref.current?.items.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(ref.current?.hasMore).toBe(false);
  });

  it('ignores a slow response that belongs to an older query', async () => {
    let releaseOld!: (r: PagedResult<ProductDto>) => void;
    mockFetch.mockImplementationOnce(() => new Promise((res) => { releaseOld = res; })).mockResolvedValueOnce(page([9], false));
    const { ref, rerender } = mount('old');
    rerender('new');
    await flush();
    expect(ref.current?.items.map((p) => p.id)).toEqual(['9']);
    await act(async () => { releaseOld(page([1, 2, 3], true)); await Promise.resolve(); });
    expect(ref.current?.items.map((p) => p.id)).toEqual(['9']);
    expect(ref.current?.hasMore).toBe(false);
  });

  it('a failed page keeps what is loaded, flags the failure, and retry fetches that same page', async () => {
    mockFetch.mockResolvedValueOnce(page([1], true)).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(page([2], false, 2));
    const { ref } = mount('a');
    await flush();
    act(() => ref.current?.loadMore());
    await flush();
    expect(ref.current?.failed).toBe(true);
    expect(ref.current?.items).toHaveLength(1);
    act(() => ref.current?.loadMore()); // blocked while failed
    expect(mockFetch).toHaveBeenCalledTimes(2);
    act(() => ref.current?.retry());
    await flush();
    expect(ref.current?.failed).toBe(false);
    expect(ref.current?.items.map((p) => p.id)).toEqual(['1', '2']);
    expect(mockFetch.mock.calls[2][0].page).toBe(2);
  });
});
