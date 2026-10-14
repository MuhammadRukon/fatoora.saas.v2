/** Accepts only a same-origin absolute path; anything else (protocol-relative, backslash or control-char tricks) becomes "/". */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001F\\]/.test(raw) ? '/' : raw;
}
