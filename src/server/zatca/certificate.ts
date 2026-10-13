import { createHash, X509Certificate as NodeX509 } from 'node:crypto';
import { BitString, fromBER, Sequence } from 'asn1js';

// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING } (RFC 5280)
function certificateSignature(der: Buffer): Buffer {
  const cert = fromBER(new Uint8Array(der)).result as Sequence;
  return Buffer.from((cert.valueBlock.value[2] as BitString).valueBlock.valueHexView);
}

/** Bare base64 DER body of a certificate given as PEM or as the body itself. */
export const certificateBody = (pemOrBody: string) =>
  pemOrBody.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');

export const toCertificatePem = (body: string) =>
  `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;

/** ZATCA's binarySecurityToken is base64 of the certificate's base64 body. */
export function certificateFromToken(binarySecurityToken: string) {
  const body = certificateBody(Buffer.from(binarySecurityToken, 'base64').toString('utf8'));
  return { body, pem: toCertificatePem(body) };
}

// xades:CertDigest value. ZATCA hashes the base64 *text* of the certificate (not the DER) and base64-encodes the
// hex digest: verified against the guideline v2 sec. 5.2 step 3 example and the SDK sample's CertDigest.
export const certificateDigest = (body: string) =>
  Buffer.from(createHash('sha256').update(body, 'utf8').digest('hex'), 'utf8').toString('base64');

export function certificateInfo(pemOrBody: string) {
  const body = certificateBody(pemOrBody);
  const der = Buffer.from(body, 'base64');
  const node = new NodeX509(der);
  return {
    body,
    digest: certificateDigest(body),
    // Node lists RDNs in DER order, one per line; ZATCA samples print them reversed (RFC 2253), ", "-joined.
    issuerName: node.issuer.split('\n').reverse().join(', '),
    serialNumber: BigInt(`0x${node.serialNumber}`).toString(10),
    notAfter: new Date(node.validTo),
    publicKeyDer: node.publicKey.export({ type: 'spki', format: 'der' }), // QR tag 8
    signature: certificateSignature(der), // QR tag 9
  };
}
