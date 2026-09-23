import { describe, expect, it } from 'vitest';
import { readBody, readText } from '../src/server/http';
import { DomainError } from '../src/server/service';

/** A chunked request: no Content-Length, the body arrives in 1 KB pieces. */
function chunked(totalBytes: number) {
  let sent = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (sent >= totalBytes) return controller.close();
      const n = Math.min(1024, totalBytes - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n).fill(97));
    },
  });
  const request = new Request('http://127.0.0.1/api/loopbox', {
    method: 'POST',
    body,
    // @ts-expect-error Node's fetch needs duplex for a streamed request body
    duplex: 'half',
  });
  return { request, pulls: () => pulls };
}

describe('request body cap', () => {
  it('reads a body under the cap', async () => {
    const { request } = chunked(3000);
    expect((await readBody(request, 8192)).byteLength).toBe(3000);
    expect(await readText(new Request('http://x/', { method: 'POST', body: '{"a":1}' }), 100)).toBe(
      '{"a":1}',
    );
  });
  it('stops reading a chunked body as soon as it passes the cap (413)', async () => {
    const { request, pulls } = chunked(10 * 1024 * 1024);
    const error = await readBody(request, 8192).catch((e) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).status).toBe(413);
    // 8 KB cap in 1 KB chunks: it gave up after ~9 chunks, not 10 MB.
    expect(pulls()).toBeLessThan(20);
  });
  it('refuses a declared Content-Length above the cap before reading', async () => {
    const request = new Request('http://x/', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '999999' },
    });
    await expect(readBody(request, 8192)).rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' });
  });
});
