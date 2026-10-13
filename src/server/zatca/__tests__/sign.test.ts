import { describe, expect, it } from 'vitest';
import { signatureBlock, signedPropertiesDigest, verifySignedInvoice } from '../sign';
import { SAMPLE_CERT_BODY, SAMPLE_XML } from './vectors';

const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b) + b.length);

describe('signatureBlock', () => {
  it('reproduces the SDK sample UBLExtensions block byte for byte (minus its sample-values comment)', () => {
    const expected = between(SAMPLE_XML, '<ext:UBLExtensions>', '</ext:UBLExtensions>').replace(
      '            <!-- Please note that the signature values are sample values only -->\n',
      '',
    );
    const block = signatureBlock({
      invoiceHash: 'oeRPH/CKLQuledRrrl2ckczL9bmtn7c8mxBFtNZkTRg=',
      signatureValue:
        'MEUCICn7TLKk1k0Oxwd5TSZYKPNRMlL917+UOb3G399Bqj1VAiEA2iYaadaGDQnGoXmbI4wPW41bbbXYfY9262awA2hWDZU=',
      certificateBody: SAMPLE_CERT_BODY,
      signingTime: '2022-09-10T22:19:53Z',
      certificateDigest: 'NjlhOTVmYzIzN2I0MjcxNGRjNDQ1N2EzM2I5NGNjNDUyZmQ5ZjExMDUwNGM2ODNjNDAxMTQ0ZDk1NDQ4OTRmYg==',
      issuerName: 'CN=TSZEINVOICE-SubCA-1, DC=extgazt, DC=gov, DC=local',
      serialNumber: '2475382876776561391517206651645660279462721580',
    });
    expect(block).toBe(expected);
  });
});

describe('signedPropertiesDigest', () => {
  it("matches the sample's #xadesSignedProperties DigestValue (ZATCA staff convention, forum t/717)", () => {
    expect(signedPropertiesDigest(SAMPLE_XML)).toBe(
      'MjNlMDdlOTNlNTAyMjJlMjRjNWZiY2RkOWRhNWE0ZGI1ODgxZGRkZjJiZWExZjA2ZTNhY2RlYzFjMTFlZjE5MA==',
    );
  });
});

describe('verifySignedInvoice', () => {
  it('accepts the SDK-produced sample: hash, SignedProperties digest and ECDSA signature', () => {
    expect(verifySignedInvoice(SAMPLE_XML)).toMatchObject({
      hashValid: true,
      signedPropertiesValid: true,
      signatureValid: true,
      certificateDigestValid: true,
    });
  });

  it('flags a tampered invoice', () => {
    const tampered = SAMPLE_XML.replace('<cbc:UUID>62</cbc:UUID>', '<cbc:UUID>63</cbc:UUID>');
    expect(verifySignedInvoice(tampered)).toMatchObject({ hashValid: false, signedPropertiesValid: true, signatureValid: true });
    const badTime = SAMPLE_XML.replace('2022-09-10T22:19:53Z', '2022-09-10T22:19:54Z');
    expect(verifySignedInvoice(badTime).signedPropertiesValid).toBe(false);
  });
});
