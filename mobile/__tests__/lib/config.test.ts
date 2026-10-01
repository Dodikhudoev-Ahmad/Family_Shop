import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from '../../src/config';

describe('resolveApiBaseUrl', () => {
  it('defaults to the production API over https', () => {
    expect(resolveApiBaseUrl(undefined, false)).toBe(DEFAULT_API_BASE_URL);
    expect(DEFAULT_API_BASE_URL.startsWith('https://')).toBe(true);
  });

  it('trims whitespace and trailing slashes', () => {
    expect(resolveApiBaseUrl('  https://api.example.kz/api/v1//  ', false)).toBe('https://api.example.kz/api/v1');
  });

  it('refuses plain http in a release build (tokens travel in bodies and headers)', () => {
    expect(() => resolveApiBaseUrl('http://192.168.1.5:5280/api/v1', false)).toThrow(/https/);
  });

  it('allows plain http in development for a local backend', () => {
    expect(resolveApiBaseUrl('http://192.168.1.5:5280/api/v1', true)).toBe('http://192.168.1.5:5280/api/v1');
  });
});
