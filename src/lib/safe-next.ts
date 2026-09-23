/** Only same-site relative paths, so ?next= can never send someone to another website. */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u001f]/.test(next))
    return '/';
  return next;
}
