import { describe, expect, it } from 'vitest';
import { buildQrTlv, parseQrTlv, ZatcaQrError } from '../qr';
import { GUIDELINE_TAG8_HEX, GUIDELINE_TAG9_HEX } from './vectors';

describe('buildQrTlv', () => {
  it('reproduces the guideline sec. 6.4 phase-1 example (tags 1-5)', () => {
    const qr = buildQrTlv({
      sellerName: 'Bobs Basement Records',
      vatNumber: '100025906700003',
      timestamp: '2022-04-25T15:30:00Z',
      totalWithVat: '2100100.99',
      vatTotal: '315015.15',
    });
    expect(qr).toBe('ARVCb2JzIEJhc2VtZW50IFJlY29yZHMCDzEwMDAyNTkwNjcwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoECjIxMDAxMDAuOTkFCTMxNTAxNS4xNQ==');
  });

  it('reproduces the guideline sec. 6.2 phase-2 example (tags 1-9)', () => {
    const qr = buildQrTlv({
      sellerName: 'Ahmed Mohamed AL Ahmady',
      vatNumber: '301121971500003',
      timestamp: '2022-03-13T14:40:40Z',
      totalWithVat: '1108.90',
      vatTotal: '144.9',
      invoiceHash: 'QnVEexW4nWv4CaE39a/66Jp/OXO/evHQ8pDlG7weq/4=',
      signature: 'MEUCIQD5zxyXOB7NvWf62rVEZAYU71jpy9HEEnZ0q9O96wrL6QIgQJzCGHbw6YBHLYVdO1wnUhBgKm8jMTyvck9M+rP9xYY=',
      publicKey: Buffer.from(GUIDELINE_TAG8_HEX, 'hex'),
      certificateSignature: Buffer.from(GUIDELINE_TAG9_HEX, 'hex'),
    });
    expect(qr).toBe(
      'ARdBaG1lZCBNb2hhbWVkIEFMIEFobWFkeQIPMzAxMTIxOTcxNTAwMDAzAxQyMDIyLTAzLTEzVDE0OjQwOjQwWgQHMTEwOC45MAUFMTQ0LjkGLFFuVkVleFc0bld2NENhRTM5YS82NkpwL09YTy9ldkhROHBEbEc3d2VxLzQ9B2BNRVVDSVFENXp4eVhPQjdOdldmNjJyVkVaQVlVNzFqcHk5SEVFblowcTlPOTZ3ckw2UUlnUUp6Q0dIYnc2WUJITFlWZE8xd25VaEJnS204ak1UeXZjazlNK3JQOXhZWT0IWDBWMBAGByqGSM49AgEGBSuBBAAKA0IABGGDDKDmhWAITDv7LXqLX2cmr6+qddUkpcLCvWs5rC2O29W/hS4ajAK4Qdnahym6MaijX75Cg3j4aao7ouYXJ9EJSDBGAiEA7mHT6yg85jtQGWp3M7tPT7Jk2+zsvVHGs3bU5Z7YE68CIQD60ebQamYjYvdebnFjNfx4X4dop7LsEBFCNSsLY0IFaQ==',
    );
  });

  it('uses the UTF-8 byte length, not the character count, for Arabic values', () => {
    const name = 'شركة الاختبار'; // 13 characters, 25 UTF-8 bytes
    const tag1 = parseQrTlv(buildQrTlv({ sellerName: name, vatNumber: '1', timestamp: 't', totalWithVat: '1', vatTotal: '0' }))[1];
    expect(name.length).toBe(13);
    expect(tag1.length).toBe(25);
    expect(Buffer.from(buildQrTlv({ sellerName: name, vatNumber: '1', timestamp: 't', totalWithVat: '1', vatTotal: '0' }), 'base64')[1]).toBe(25);
    expect(tag1.toString('utf8')).toBe(name);
  });

  it('rejects a value longer than 255 bytes and a QR longer than 1000 base64 chars', () => {
    const base = { vatNumber: '1', timestamp: 't', totalWithVat: '1', vatTotal: '0' };
    expect(() => buildQrTlv({ ...base, sellerName: 'x'.repeat(256) })).toThrow(ZatcaQrError);
    expect(() => buildQrTlv({ ...base, sellerName: 'x'.repeat(256) })).toThrow('QR_FIELD_TOO_LONG');
    expect(() => buildQrTlv({ ...base, sellerName: 'x'.repeat(255) })).not.toThrow();
    const big = 'x'.repeat(250);
    expect(() => buildQrTlv({ ...base, sellerName: big, invoiceHash: big, signature: big })).toThrow('QR_TOO_LONG');
  });
});

describe('parseQrTlv', () => {
  it('splits a QR into its tags', () => {
    const tags = parseQrTlv('ARVCb2JzIEJhc2VtZW50IFJlY29yZHMCDzEwMDAyNTkwNjcwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoECjIxMDAxMDAuOTkFCTMxNTAxNS4xNQ==');
    expect(Object.keys(tags)).toEqual(['1', '2', '3', '4', '5']);
    expect(tags[3].toString()).toBe('2022-04-25T15:30:00Z');
  });

  it('throws on a truncated TLV', () => {
    expect(() => parseQrTlv(Buffer.from([1, 5, 65]).toString('base64'))).toThrow(ZatcaQrError);
  });
});
