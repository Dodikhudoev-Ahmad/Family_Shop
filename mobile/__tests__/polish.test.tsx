import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import i18n from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import kk from '../src/i18n/locales/kk.json';
import ru from '../src/i18n/locales/ru.json';

const ROOT = join(__dirname, '..');
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
const files = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'App.tsx')];
const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => f.replace(`${ROOT}/`, '');

type Tree = { [key: string]: string | Tree };
const PLURAL = /_(zero|one|two|few|many|other)$/;

/** Every leaf as `path -> text`, with plural suffixes folded away (`reviews.count_one` -> `reviews.count`). */
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? [[path.replace(PLURAL, ''), v] as [string, string]] : leaves(v, path);
  });
}

describe('translations', () => {
  const dictionaries: [string, Tree][] = [['ru', ru as Tree], ['kk', kk as Tree], ['en', en as Tree]];

  it.each(dictionaries)('%s has no empty or whitespace-only values', (_name, dict) => {
    const empty = leaves(dict).filter(([, text]) => !text.trim()).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(dictionaries)('%s keeps the same {{placeholders}} as ru for every key', (name, dict) => {
    if (name === 'ru') return;
    const ruByKey = new Map(leaves(ru as Tree));
    const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
    const mismatched = leaves(dict)
      .filter(([key, text]) => ruByKey.has(key) && placeholders(text) !== placeholders(ruByKey.get(key) ?? ''))
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('every literal key used in the source exists in all three languages', () => {
    const used = new Set<string>();
    for (const file of files) {
      for (const m of read(file).matchAll(/\b(?:i18n\.)?t\(\s*'([a-zA-Z][\w.-]*\.[\w.-]+)'/g)) used.add(m[1]);
      // keys stored in tables (labelKey: 'x.y', key: 'x.y') and passed to t() later
      for (const m of read(file).matchAll(/(?:labelKey|key)\s*:\s*'([a-z][\w]*\.[\w.]+)'/g)) used.add(m[1]);
      for (const m of read(file).matchAll(/\bt\(\s*'([a-zA-Z][\w.-]*\.[\w.-]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(80);
    const missing: string[] = [];
    for (const [name, dict] of dictionaries) {
      const have = new Set(leaves(dict).map(([key]) => key));
      for (const key of used) if (!have.has(key)) missing.push(`${name}: ${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('every key defined under mobile.* is actually used (no dead strings)', () => {
    const src = files.map(read).join('\n');
    const dead = leaves((ru as Tree).mobile as Tree, 'mobile')
      .map(([key]) => key)
      .filter((key) => !src.includes(`'${key}'`) && !src.includes(`"${key}"`));
    expect(dead).toEqual([]);
  });
});

describe('accessibility', () => {
  /** The opening tag of every <Pressable ...>, balanced over braces so `{() => a > b}` does not end it early. */
  function pressableTags(code: string): string[] {
    const tags: string[] = [];
    let from = 0;
    for (;;) {
      const start = code.indexOf('<Pressable', from);
      if (start === -1) return tags;
      let depth = 0;
      let i = start;
      for (; i < code.length; i++) {
        const ch = code[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0 && code[i - 1] !== '=') break;
      }
      tags.push(code.slice(start, i + 1));
      from = i + 1;
    }
  }

  it('every Pressable has an accessibilityLabel (icon-only buttons would otherwise be announced as nothing)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of pressableTags(read(file))) {
        if (!/accessibilityLabel\s*=/.test(tag)) offenders.push(`${rel(file)}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every Pressable declares an accessibility role', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of pressableTags(read(file))) {
        if (!/accessibilityRole\s*=/.test(tag)) offenders.push(`${rel(file)}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('ErrorBoundary', () => {
  const Bomb = ({ explode }: { explode: boolean }) => {
    if (explode) throw new Error('secret internal detail: token=abc123 at /Users/dev/file.tsx:42');
    return <Text>all fine</Text>;
  };

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); // React logs the caught error itself
  });
  afterEach(() => errorSpy.mockRestore());

  const flat = (node: unknown): string => JSON.stringify(node);

  it('shows "something went wrong" with a restart button, and leaks nothing about the error', async () => {
    await i18n.changeLanguage('ru');
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ErrorBoundary>
          <Bomb explode />
        </ErrorBoundary>
      );
    });
    const out = flat(tree.toJSON());
    expect(out).toContain(i18n.t('errors.boundaryTitle'));
    expect(out).toContain(i18n.t('mobile.restart'));
    expect(out).not.toMatch(/secret internal detail|abc123|file\.tsx|Error/);
  });

  it('restart rebuilds the subtree: a recovered child renders again', async () => {
    let explode = true;
    let tree!: ReturnType<typeof create>;
    const Maybe = () => <Bomb explode={explode} />;
    act(() => {
      tree = create(
        <ErrorBoundary>
          <Maybe />
        </ErrorBoundary>
      );
    });
    expect(flat(tree.toJSON())).toContain(i18n.t('mobile.restart'));

    explode = false;
    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    act(() => {
      button.props.onResponderRelease();
    });
    expect(flat(tree.toJSON())).toContain('all fine');
  });
});
