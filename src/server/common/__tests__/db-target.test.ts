import { describe, expect, it } from 'vitest';

import { assertLocalDatabase, describeTarget } from '../db-target';

type GuardArgs = Parameters<typeof assertLocalDatabase>[0];

const LOCAL = 'postgresql://u:p@localhost:5433/gadget_dev';
const SHADOW = 'postgresql://u:p@localhost:5433/gadget_shadow';
// Unescaped "/" in a password: host becomes "u", path becomes "/ss@h".
const LEAKY = 'postgresql://u:1/ss@h';

/**
 * Run the guard and return the thrown message (fails the test if it does not throw).
 * Error messages must never leak credentials or a full connection string.
 */
function messageOf(args: GuardArgs): string {
  try {
    assertLocalDatabase(args);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).not.toMatch(/:\/\/[^\s]*:[^\s]*@/);
    return message;
  }
  throw new Error('expected assertLocalDatabase to throw');
}

describe('db-target: assertLocalDatabase accepts', () => {
  it.each<[string, GuardArgs]>([
    ['localhost', { databaseUrl: LOCAL }],
    ['127.0.0.1', { databaseUrl: 'postgresql://u:p@127.0.0.1:5433/gadget_dev' }],
    ['[::1]', { databaseUrl: 'postgresql://u:p@[::1]:5433/gadget_dev' }],
    ['unrelated query params', { databaseUrl: `${LOCAL}?schema=public&connection_limit=5` }],
    ['an absent shadowUrl (undefined)', { databaseUrl: LOCAL, shadowUrl: undefined }],
    ['an absent shadowUrl (empty string)', { databaseUrl: LOCAL, shadowUrl: '' }],
    ['a distinct local shadowUrl', { databaseUrl: LOCAL, shadowUrl: SHADOW }],
    [
      'a different database name on the same host and port',
      { databaseUrl: LOCAL, shadowUrl: 'postgresql://u:p@127.0.0.1:5433/gadget_shadow' },
    ],
    [
      'the same database name on a different port',
      { databaseUrl: LOCAL, shadowUrl: 'postgresql://u:p@localhost:5434/gadget_dev' },
    ],
    [
      'a valid distinct shadowUrl when requireShadow is true',
      { databaseUrl: LOCAL, shadowUrl: SHADOW, requireShadow: true },
    ],
    [
      'a missing shadowUrl when requireShadow is false',
      { databaseUrl: LOCAL, requireShadow: false },
    ],
  ])('accepts %s', (_label, args) => {
    expect(() => assertLocalDatabase(args)).not.toThrow();
  });
});

describe('db-target: assertLocalDatabase missing url or shadow', () => {
  it.each<[string, GuardArgs, string]>([
    ['databaseUrl is undefined', { databaseUrl: undefined }, 'DATABASE_URL is not set'],
    ['databaseUrl is an empty string', { databaseUrl: '' }, 'DATABASE_URL is not set'],
    [
      'a missing DATABASE_URL is reported before a missing shadow',
      { requireShadow: true },
      'DATABASE_URL is not set',
    ],
    [
      'requireShadow is true and shadowUrl is undefined',
      { databaseUrl: LOCAL, requireShadow: true },
      'SHADOW_DATABASE_URL is not set',
    ],
    [
      'requireShadow is true and shadowUrl is empty',
      { databaseUrl: LOCAL, shadowUrl: '', requireShadow: true },
      'SHADOW_DATABASE_URL is not set',
    ],
  ])('throws when %s', (_label, args, expected) => {
    expect(messageOf(args)).toContain(expected);
  });
});

describe('db-target: assertLocalDatabase remote hosts', () => {
  it.each<[string, GuardArgs, string]>([
    [
      'a remote host',
      { databaseUrl: 'postgresql://u:secretpw@db.prisma.io:5432/postgres' },
      'db.prisma.io/postgres',
    ],
    [
      'a host that merely starts with localhost (no suffix matching)',
      { databaseUrl: 'postgresql://u:secretpw@localhost.evil.com:5432/x' },
      'localhost.evil.com/x',
    ],
    [
      'the userinfo trick where localhost is the username',
      { databaseUrl: 'postgresql://localhost@db.prisma.io:5432/x' },
      'db.prisma.io/x',
    ],
    [
      'a remote shadowUrl',
      { databaseUrl: LOCAL, shadowUrl: 'postgresql://u:secretpw@db.prisma.io:5432/shadow' },
      'db.prisma.io/shadow',
    ],
  ])('rejects %s and names host and path without credentials', (_label, args, target) => {
    const message = messageOf(args);
    expect(message).toContain(target);
    expect(message).not.toContain('secretpw');
  });

  it('rejects a malformed url without echoing the input', () => {
    const input = 'not a url with secretpw';
    const message = messageOf({ databaseUrl: input });
    expect(message).not.toContain(input);
    expect(message).not.toContain('secretpw');
  });
});

describe('db-target: assertLocalDatabase host override params', () => {
  it.each([
    ['host', '?host=', 'db.prisma.io'],
    ['hostaddr', '?hostaddr=', '1.2.3.4'],
    ['HOST (case-insensitive)', '?HOST=', 'db.prisma.io'],
    ['HostAddr (case-insensitive)', '?HostAddr=', '1.2.3.4'],
  ])('rejects a %s query param', (_label, param, value) => {
    const message = messageOf({ databaseUrl: `${LOCAL}${param}${value}` });
    expect(message).toContain('localhost/gadget_dev');
    expect(message).not.toContain(value);
  });
});

describe('db-target: assertLocalDatabase shadow must differ from database', () => {
  it.each([
    ['identical urls', LOCAL, LOCAL],
    [
      'same host, port and path but different credentials',
      LOCAL,
      'postgresql://other:otherpw@localhost:5433/gadget_dev',
    ],
    ['localhost vs 127.0.0.1', LOCAL, 'postgresql://u:p@127.0.0.1:5433/gadget_dev'],
    ['localhost vs [::1]', LOCAL, 'postgresql://u:p@[::1]:5433/gadget_dev'],
    [
      'omitted port vs :5432',
      'postgresql://u:p@localhost/gadget_dev',
      'postgresql://u:p@localhost:5432/gadget_dev',
    ],
    [
      '127.0.0.1:5432 vs omitted port on localhost',
      'postgresql://u:p@127.0.0.1:5432/gadget_dev',
      'postgresql://u:p@localhost/gadget_dev',
    ],
    ['trailing slash', LOCAL, 'postgresql://u:p@localhost:5433/gadget_dev/'],
    ['path case', LOCAL, 'postgresql://u:p@localhost:5433/Gadget_Dev'],
  ])('rejects a shadowUrl that is the same database (%s)', (_label, databaseUrl, shadowUrl) => {
    const message = messageOf({ databaseUrl, shadowUrl });
    expect(message).toMatch(/must differ/);
    expect(message).not.toContain('otherpw');
  });
});

describe('db-target: credential fragments in the path', () => {
  it.each<[string, GuardArgs]>([
    ['database URL', { databaseUrl: LEAKY }],
    ['shadow URL', { databaseUrl: LOCAL, shadowUrl: LEAKY }],
  ])('does not echo a credential fragment for a remote %s', (_label, args) => {
    const message = messageOf(args);
    expect(message).toContain('/(redacted)');
    expect(message).not.toContain('ss@h');
  });

  it('redacts a path containing ":" on an otherwise local URL', () => {
    const message = messageOf({
      databaseUrl: 'postgresql://u:p@localhost:5433/db:secret?host=x',
    });
    expect(message).toContain('/(redacted)');
    expect(message).not.toContain('secret');
  });

  it('prints only the first path segment', () => {
    const message = messageOf({
      databaseUrl: 'postgresql://u:p@db.prisma.io:5432/postgres/extra/more',
    });
    expect(message).toContain('db.prisma.io/postgres');
    expect(message).not.toContain('extra');
  });
});

describe('db-target: describeTarget', () => {
  it.each([
    [
      'strips credentials and query, keeps the port',
      'postgresql://u:secretpw@localhost:5433/gadget_dev?sslmode=disable',
      'localhost:5433/gadget_dev',
    ],
    [
      'omits the port when none is given',
      'postgresql://u:secretpw@localhost/gadget_dev',
      'localhost/gadget_dev',
    ],
    [
      'prints only the first path segment',
      'postgresql://u:p@localhost:5433/gadget_dev/extra',
      'localhost:5433/gadget_dev',
    ],
    ['redacts a suspicious path and drops the port', LEAKY, 'u/(redacted)'],
  ])('%s', (_label, input, expected) => {
    expect(describeTarget(input)).toBe(expected);
  });
});
