import type { Document, Element, Node } from '@xmldom/xmldom';

// Canonical XML 1.1 without comments (https://www.w3.org/TR/xml-c14n11/) for the subset UBL uses:
// elements, attributes, namespaces, text, PIs inside the document element. No DTD, no xml:* inheritance
// (UBL never uses xml:base/xml:lang). shortcut: document-level PIs/comments are ignored, upgrade if a
// sample ever carries one outside the root element.

const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const PI = 7;

type Ns = Map<string, string>; // prefix ('' = default) -> namespace URI

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');

function declaredNs(el: Element, into: Ns) {
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name === 'xmlns') into.set('', a.value);
    else if (a.prefix === 'xmlns') into.set(a.localName!, a.value);
  }
}

// Namespaces in scope at `node` from its ancestors (for canonicalizing a subtree).
function inheritedNs(node: Node | null): Ns {
  const chain: Element[] = [];
  for (let n = node; n && n.nodeType === ELEMENT; n = n.parentNode) chain.unshift(n as Element);
  const ns: Ns = new Map();
  chain.forEach((el) => declaredNs(el, ns));
  return ns;
}

function renderElement(el: Element, parentScope: Ns, rendered: Ns): string {
  const scope = new Map(parentScope);
  declaredNs(el, scope);

  const out = new Map(rendered);
  const nsDecls: string[] = [];
  for (const prefix of [...scope.keys()].sort()) {
    const uri = scope.get(prefix)!;
    if (prefix === 'xml' || (rendered.get(prefix) ?? '') === uri) continue;
    if (prefix !== '' && uri === '') continue;
    out.set(prefix, uri);
    nsDecls.push(prefix ? ` xmlns:${prefix}="${escAttr(uri)}"` : ` xmlns="${escAttr(uri)}"`);
  }

  const attrs: { ns: string; local: string; text: string }[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.name === 'xmlns' || a.prefix === 'xmlns') continue;
    attrs.push({ ns: a.namespaceURI ?? '', local: a.localName ?? a.name, text: ` ${a.name}="${escAttr(a.value)}"` });
  }
  attrs.sort((x, y) => (x.ns === y.ns ? cmp(x.local, y.local) : cmp(x.ns, y.ns)));

  let body = '';
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === ELEMENT) body += renderElement(c as Element, scope, out);
    else if (c.nodeType === TEXT || c.nodeType === CDATA) body += escText((c as unknown as { data: string }).data);
    else if (c.nodeType === PI) {
      const pi = c as unknown as { target: string; data: string };
      body += `<?${pi.target}${pi.data ? ` ${pi.data}` : ''}?>`;
    }
  }
  return `<${el.tagName}${nsDecls.join('')}${attrs.map((a) => a.text).join('')}>${body}</${el.tagName}>`;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalize(node: Document | Element): string {
  const el = node.nodeType === ELEMENT ? (node as Element) : (node as Document).documentElement!;
  return renderElement(el, inheritedNs(el.parentNode), new Map([['', '']]));
}
