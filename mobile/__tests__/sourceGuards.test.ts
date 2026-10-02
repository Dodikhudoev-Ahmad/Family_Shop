import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Cheap structural guards for the project rules: no token logging, no `any`, secrets only in the secure store. */

const ROOT = join(__dirname, '..');
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });

const files = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'App.tsx')];
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => file.replace(`${ROOT}/`, '');

describe('project rules', () => {
  it('nothing in the app logs anything (so a token can never reach console or an error reporter)', () => {
    const offenders = files.filter((f) => /\bconsole\.(log|info|warn|error|debug|trace)\b/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no explicit `any`', () => {
    const offenders = files.filter((f) => /(:\s*any\b|\bas\s+any\b|<any>|any\[\]|Array<any>)/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the forbidden X-Client-Type header is never used', () => {
    expect(files.filter((f) => /x-client-type/i.test(read(f))).map(rel)).toEqual([]);
  });

  it('AsyncStorage is never used for secrets - only the language, theme, cart and favourites', () => {
    const users = files.filter((f) => read(f).includes('async-storage')).map(rel).sort();
    expect(users).toEqual(['src/i18n/index.ts', 'src/state/CartContext.tsx', 'src/state/FavoritesContext.tsx', 'src/state/useSearchHistory.ts', 'src/theme/ThemeContext.tsx']);
    for (const f of files.filter((x) => read(x).includes('async-storage'))) {
      expect(read(f)).not.toMatch(/refresh|accessToken|password|deviceId/i);
    }
  });

  it('only the secure-storage module talks to expo-secure-store', () => {
    const users = files.filter((f) => /from 'expo-secure-store'/.test(read(f))).map(rel);
    expect(users).toEqual(['src/lib/storage/secureStorage.ts']);
  });

  it('products are never laid out in horizontal carousels: only these controls may scroll sideways', () => {
    const sideways = files.filter((f) => /\bhorizontal\b/.test(read(f)) && /<(FlatList|ScrollView)\b[^>]*\bhorizontal\b/s.test(read(f))).map(rel).sort();
    expect(sideways).toEqual([
      'src/components/AppHeader.tsx', // the category strip
      'src/components/Chips.tsx', // type / sort chips
      'src/components/PromoBanner.tsx', // swipeable promo banners
      'src/screens/ProductScreen.tsx', // the photo gallery
    ]);
  });

  it('localStorage / sessionStorage are never touched', () => {
    expect(files.filter((f) => /\b(localStorage|sessionStorage)\s*[.[]/.test(read(f))).map(rel)).toEqual([]);
  });
});
