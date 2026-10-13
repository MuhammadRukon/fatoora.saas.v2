import { describe, expect, it } from 'vitest';
import { certificateInfo, certificateFromToken } from '../certificate';
import { GUIDELINE_TAG8_HEX, GUIDELINE_TAG9_HEX, SAMPLE_CERT_BODY } from './vectors';

describe('certificateInfo', () => {
  const info = certificateInfo(SAMPLE_CERT_BODY);

  it('extracts the values the sample SignedProperties and QR were built from', () => {
    // Expected values: the sample's xades:IssuerSerial / CertDigest, and guideline v2 sec. 5.2 step 3 + sec. 6.2.
    expect(info.issuerName).toBe('CN=TSZEINVOICE-SubCA-1, DC=extgazt, DC=gov, DC=local');
    expect(info.serialNumber).toBe('2475382876776561391517206651645660279462721580');
    expect(info.digest).toBe('NjlhOTVmYzIzN2I0MjcxNGRjNDQ1N2EzM2I5NGNjNDUyZmQ5ZjExMDUwNGM2ODNjNDAxMTQ0ZDk1NDQ4OTRmYg==');
    expect(Buffer.from(info.publicKeyDer).toString('hex')).toBe(GUIDELINE_TAG8_HEX);
    expect(Buffer.from(info.signature).toString('hex')).toBe(GUIDELINE_TAG9_HEX);
    expect(info.notAfter.toISOString()).toBe('2024-04-18T20:49:09.000Z');
  });

  it('accepts PEM as well as the bare base64 body', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${SAMPLE_CERT_BODY.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
    expect(certificateInfo(pem)).toEqual(info);
  });
});

describe('certificateFromToken', () => {
  it('decodes a binarySecurityToken (base64 of the base64 DER) into PEM and body', () => {
    const token = Buffer.from(SAMPLE_CERT_BODY).toString('base64');
    const { pem, body } = certificateFromToken(token);
    expect(body).toBe(SAMPLE_CERT_BODY);
    expect(pem.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true);
    expect(certificateInfo(pem).serialNumber).toBe('2475382876776561391517206651645660279462721580');
  });
});
