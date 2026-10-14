/** /app pages an EXPIRED subscription may still open (read-only): the invoice list, detail and print view. */
export function isReadOnlyAppPath(pathname: string | null): boolean {
  return !!pathname && /^\/app\/invoices(\/(?!new$)[^/]+(\/print)?)?$/.test(pathname);
}
