import { describe, expect, it } from 'vitest';
import { readTokenFromHash } from './emailLinkToken';

describe('readTokenFromHash', () => {
  it('reads the token from a fragment', () => {
    expect(readTokenFromHash('#token=AbC_d-1')).toBe('AbC_d-1');
    expect(readTokenFromHash('token=AbC')).toBe('AbC');
    expect(readTokenFromHash('#a=1&token=AbC&b=2')).toBe('AbC');
  });

  it.each(['', '#', '#token=', '#tokens=abc', '#token=<script>', '#token=a b', `#token=${'A'.repeat(129)}`])(
    'refuses %j',
    (hash) => {
      expect(readTokenFromHash(hash)).toBeNull();
    },
  );
});
