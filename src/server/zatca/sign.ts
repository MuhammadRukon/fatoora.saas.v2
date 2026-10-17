import { createHash, sign, verify, X509Certificate } from 'node:crypto';
import type { Element } from '@xmldom/xmldom';
import { certificateInfo } from './certificate';
import { computeInvoiceHash, NS, parseXml } from './hash';
import { buildQrTlv } from './qr';
import { toZatcaDateTime } from './time';
import { QR_PLACEHOLDER, UBL_EXTENSIONS_PLACEHOLDER } from './xml/ubl-builder';

// Signed input for ds:SignatureValue: ECDSA-SHA256 over the 32 raw invoice-hash bytes (guideline v2 sec. 5.2
// step 2, "invoice hash (not encoded)"; same as zatca-xml-js). Verified against the SDK sample's SignatureValue.
// To be re-confirmed by the Simulation gate (AC6.4).
export const SIGNATURE_INPUT = 'raw-invoice-hash-bytes' as const;

type BlockValues = {
  invoiceHash: string;
  signatureValue: string;
  certificateBody: string;
  signingTime: string;
  certificateDigest: string;
  issuerName: string;
  serialNumber: string;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// SignedProperties exactly as it sits in the document. The whitespace is load-bearing: ZATCA hashes this element
// as submitted (forum t/717), so it must match the SDK sample (SignedSignatureProperties at 36 spaces).
function signedPropertiesXml(v: BlockValues): string {
  return `<xades:SignedProperties Id="xadesSignedProperties">
                                    <xades:SignedSignatureProperties>
                                        <xades:SigningTime>${v.signingTime}</xades:SigningTime>
                                        <xades:SigningCertificate>
                                            <xades:Cert>
                                                <xades:CertDigest>
                                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                    <ds:DigestValue>${v.certificateDigest}</ds:DigestValue>
                                                </xades:CertDigest>
                                                <xades:IssuerSerial>
                                                    <ds:X509IssuerName>${esc(v.issuerName)}</ds:X509IssuerName>
                                                    <ds:X509SerialNumber>${v.serialNumber}</ds:X509SerialNumber>
                                                </xades:IssuerSerial>
                                            </xades:Cert>
                                        </xades:SigningCertificate>
                                    </xades:SignedSignatureProperties>
                                </xades:SignedProperties>`;
}

/**
 * #xadesSignedProperties digest. ZATCA (staff, forum t/717) hashes the element text as a DOM serializer emits a
 * detached subtree: xmlns:xades on the root and xmlns:ds on each ds element, whitespace untouched, no C14N; then
 * base64 of the *hex* SHA-256. Verified against the SDK sample. Takes the signed document or the element text.
 */
export function signedPropertiesDigest(xmlOrElement: string): string {
  const start = xmlOrElement.indexOf('<xades:SignedProperties');
  const endTag = '</xades:SignedProperties>';
  const end = xmlOrElement.indexOf(endTag);
  if (start < 0 || end < 0) throw new Error('xades:SignedProperties not found');
  const forHash = xmlOrElement
    .slice(start, end + endTag.length)
    .replace('<xades:SignedProperties', `<xades:SignedProperties xmlns:xades="${NS.xades}"`)
    .replace(/<ds:(\w+)/g, `<ds:$1 xmlns:ds="${NS.ds}"`);
  return Buffer.from(createHash('sha256').update(forHash, 'utf8').digest('hex'), 'utf8').toString('base64');
}

/** The ext:UBLExtensions element, byte-identical in layout to the ZATCA SDK sample. */
export function signatureBlock(v: BlockValues): string {
  const signedProperties = signedPropertiesXml(v);
  return `<ext:UBLExtensions>
    <ext:UBLExtension>
        <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
        <ext:ExtensionContent>
            <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
                <sac:SignatureInformation>
                    <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
                    <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
                    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
                        <ds:SignedInfo>
                            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                            <ds:Reference Id="invoiceSignedData" URI="">
                                <ds:Transforms>
                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                                        <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                                    </ds:Transform>
                                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                                </ds:Transforms>
                                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                <ds:DigestValue>${v.invoiceHash}</ds:DigestValue>
                            </ds:Reference>
                            <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                <ds:DigestValue>${signedPropertiesDigest(signedProperties)}</ds:DigestValue>
                            </ds:Reference>
                        </ds:SignedInfo>
                        <ds:SignatureValue>${v.signatureValue}</ds:SignatureValue>
                        <ds:KeyInfo>
                            <ds:X509Data>
                                <ds:X509Certificate>${v.certificateBody}</ds:X509Certificate>
                            </ds:X509Data>
                        </ds:KeyInfo>
                        <ds:Object>
                            <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
                                ${signedProperties}
                            </xades:QualifyingProperties>
                        </ds:Object>
                    </ds:Signature>
                </sac:SignatureInformation>
            </sig:UBLDocumentSignatures>
        </ext:ExtensionContent>
    </ext:UBLExtension>
</ext:UBLExtensions>`;
}

const spliceOnce = (xml: string, marker: string, value: string) => {
  const at = xml.indexOf(marker);
  if (at < 0 || xml.indexOf(marker, at + 1) >= 0) throw new Error(`Expected exactly one ${marker} in the unsigned XML`);
  return xml.slice(0, at) + value + xml.slice(at + marker.length);
};

const text = (xml: ReturnType<typeof parseXml>, ns: string, name: string) =>
  xml.getElementsByTagNameNS(ns, name).item(0)?.textContent ?? '';

/**
 * Stamps an unsigned document from buildUnsignedInvoiceXml (guideline v2 sec. 5.2 order). The output is produced by
 * string splicing only, so the hashed bytes are exactly the submitted bytes.
 */
export function signInvoice(input: { xml: string; privateKeyPem: string; certificatePem: string; signingTime: Date }) {
  const invoiceHash = computeInvoiceHash(input.xml);
  const signatureValue = sign('sha256', Buffer.from(invoiceHash, 'base64'), {
    key: input.privateKeyPem,
    dsaEncoding: 'der',
  }).toString('base64');
  const cert = certificateInfo(input.certificatePem);

  const block = signatureBlock({
    invoiceHash,
    signatureValue,
    certificateBody: cert.body,
    signingTime: toZatcaDateTime(input.signingTime).qrTimestamp,
    certificateDigest: cert.digest,
    issuerName: cert.issuerName,
    serialNumber: cert.serialNumber,
  });

  const doc = parseXml(input.xml);
  const supplier = doc.getElementsByTagNameNS(NS.cac, 'AccountingSupplierParty').item(0)!;
  const issueTime = text(doc, NS.cbc, 'IssueTime');
  // Tags 1-9 for both subtypes: the stamp exists for standard documents too (QR optional there, ZATCA replaces it
  // on clearance). To be re-confirmed by the Simulation gate (AC6.4).
  const qr = buildQrTlv({
    sellerName: supplier.getElementsByTagNameNS(NS.cbc, 'RegistrationName').item(0)?.textContent ?? '',
    vatNumber: supplier.getElementsByTagNameNS(NS.cbc, 'CompanyID').item(0)?.textContent ?? '',
    timestamp: `${text(doc, NS.cbc, 'IssueDate')}T${issueTime.endsWith('Z') ? issueTime : `${issueTime}Z`}`,
    totalWithVat: text(doc, NS.cbc, 'TaxInclusiveAmount'),
    vatTotal: doc.getElementsByTagNameNS(NS.cac, 'TaxTotal').item(0)!.getElementsByTagNameNS(NS.cbc, 'TaxAmount').item(0)!.textContent!,
    invoiceHash,
    signature: signatureValue,
    publicKey: cert.publicKeyDer,
    certificateSignature: cert.signature,
  });

  let signedXml = spliceOnce(input.xml, UBL_EXTENSIONS_PLACEHOLDER, block);
  signedXml = spliceOnce(signedXml, QR_PLACEHOLDER, QR_PLACEHOLDER.replace('><', `>${qr}<`));
  return { signedXml, invoiceHash, signatureValue, qr };
}

/** Independent check of a signed document (used by the golden and roundtrip tests). */
export function verifySignedInvoice(signedXml: string) {
  const doc = parseXml(signedXml);
  const digestIn = (el: Element | null | undefined) => el?.getElementsByTagNameNS(NS.ds, 'DigestValue').item(0)?.textContent ?? '';
  const refs = Array.from({ length: doc.getElementsByTagNameNS(NS.ds, 'Reference').length }, (_, i) =>
    doc.getElementsByTagNameNS(NS.ds, 'Reference').item(i)!,
  );
  const embeddedHash = digestIn(refs.find((r) => r.getAttribute('Id') === 'invoiceSignedData'));
  const embeddedSpDigest = digestIn(refs.find((r) => r.getAttribute('URI') === '#xadesSignedProperties'));
  const certBody = text(doc, NS.ds, 'X509Certificate');
  const signature = Buffer.from(text(doc, NS.ds, 'SignatureValue'), 'base64');
  const publicKey = new X509Certificate(Buffer.from(certBody, 'base64')).publicKey;
  return {
    hashValid: computeInvoiceHash(signedXml) === embeddedHash,
    signedPropertiesValid: signedPropertiesDigest(signedXml) === embeddedSpDigest,
    signatureValid: verify('sha256', Buffer.from(embeddedHash, 'base64'), { key: publicKey, dsaEncoding: 'der' }, signature),
    certificateDigestValid: digestIn(doc.getElementsByTagNameNS(NS.xades, 'CertDigest').item(0)) === certificateInfo(certBody).digest,
    embeddedHash,
  };
}
