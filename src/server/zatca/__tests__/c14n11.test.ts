import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../xml/c14n11';

const c14n = (xml: string) => canonicalize(new DOMParser().parseFromString(xml, 'text/xml'));

describe('canonicalize (C14N 1.1, no comments)', () => {
  it('drops the XML declaration, sorts attributes and expands empty elements', () => {
    // Expected values follow W3C C14N 1.1 sec. 3.3 (start/end tags, attribute order).
    expect(c14n('<?xml version="1.0" encoding="UTF-8"?>\n<doc z="1" a="2" b:x="3" xmlns:b="urn:b"><e/></doc>')).toBe(
      '<doc xmlns:b="urn:b" a="2" z="1" b:x="3"><e></e></doc>',
    );
  });

  it('renders a namespace declaration once, on the outermost element that has it in scope', () => {
    expect(
      c14n('<a xmlns="urn:x" xmlns:p="urn:p"><p:b xmlns:p="urn:p"><c xmlns="urn:x"/></p:b><d xmlns:p="urn:q"/></a>'),
    ).toBe('<a xmlns="urn:x" xmlns:p="urn:p"><p:b><c></c></p:b><d xmlns:p="urn:q"></d></a>');
  });

  it('escapes text and attribute values per spec', () => {
    // W3C C14N sec. 2.3/2.4 escaping rules
    expect(c14n('<a t="&quot;&lt;&amp;&#x9;&#xA;&#xD;&gt;">x &amp; &lt; &gt; "q" \'s\' &#xD;</a>')).toBe(
      '<a t="&quot;&lt;&amp;&#x9;&#xA;&#xD;>">x &amp; &lt; &gt; "q" \'s\' &#xD;</a>',
    );
  });

  it('keeps whitespace text nodes and processing instructions, drops comments', () => {
    expect(c14n('<a>\n  <!-- c --><?pi x?><b> t </b>\n</a>')).toBe('<a>\n  <?pi x?><b> t </b>\n</a>');
  });

  it('emits xmlns="" when a child leaves a non-empty default namespace', () => {
    expect(c14n('<a xmlns="urn:x"><b xmlns=""/></a>')).toBe('<a xmlns="urn:x"><b xmlns=""></b></a>');
  });
});
