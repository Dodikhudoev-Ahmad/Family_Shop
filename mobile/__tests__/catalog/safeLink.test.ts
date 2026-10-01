import { isHttpUrl, isInternalPath } from '../../src/lib/catalog/safeLink';

describe('safe link classification (banner buttons come from the admin panel)', () => {
  it('treats only real same-site paths as internal', () => {
    expect(isInternalPath('/catalog/women')).toBe(true);
    expect(isInternalPath('//evil.example/phish')).toBe(false);
    expect(isInternalPath('/\\evil.example')).toBe(false);
    expect(isInternalPath('javascript:alert(1)')).toBe(false);
    expect(isInternalPath('')).toBe(false);
    expect(isInternalPath(null)).toBe(false);
  });

  it('accepts only http(s) as external, never javascript:/data:', () => {
    expect(isHttpUrl('https://shop.example')).toBe(true);
    expect(isHttpUrl('HTTP://shop.example')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl('//evil.example')).toBe(false);
  });

  it('a protocol-relative link is neither internal nor external, so it is not rendered at all', () => {
    const link = '//evil.example';
    expect(isInternalPath(link) || isHttpUrl(link)).toBe(false);
  });
});
