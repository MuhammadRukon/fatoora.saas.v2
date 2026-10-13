import { createHash } from 'node:crypto';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { canonicalize } from './xml/c14n11';

export const NS = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
} as const;

// KSA-13 for the first document of an EGS: base64 of the hex SHA-256 of "0" (BR-KSA-26).
export const PIH_SEED = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export function parseXml(xml: string): Document {
  return new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') throw new Error(`Invalid XML: ${msg}`);
    },
  }).parseFromString(xml, 'text/xml');
}

const childElements = (el: Element) =>
  Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes.item(i)).filter(
    (n): n is Element => n.nodeType === 1,
  );

const isQrReference = (el: Element) =>
  el.namespaceURI === NS.cac &&
  el.localName === 'AdditionalDocumentReference' &&
  childElements(el).some((c) => c.namespaceURI === NS.cbc && c.localName === 'ID' && c.textContent?.trim() === 'QR');

// The three nodes excluded by the ds:Transforms of the invoiceSignedData reference (Security Standard 2.3.3).
// They are only ever direct children of the Invoice root in UBL.
function isExcluded(el: Element): boolean {
  if (el.namespaceURI === NS.ext && el.localName === 'UBLExtensions') return true;
  if (el.namespaceURI === NS.cac && el.localName === 'Signature') return true;
  return isQrReference(el);
}

/** Invoice hash (KSA-13 / DigestValue of invoiceSignedData): base64 of the raw SHA-256 of the C14N 1.1 form. */
export function computeInvoiceHash(xml: string): string {
  const doc = parseXml(xml);
  const root = doc.documentElement!;
  childElements(root).filter(isExcluded).forEach((el) => root.removeChild(el));
  return createHash('sha256').update(canonicalize(doc), 'utf8').digest('base64');
}
