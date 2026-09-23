import { openService } from '../../../server/app';
import { assertSameOrigin, currentUser, failure, json, readBody } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 2 * 1024 * 1024;
/**
 * POST /api/upload (multipart, field "photo", ≤ 2 MB) → { photoId }. Verified sellers only.
 * The type is decided by the file's first bytes; its name and declared type are ignored.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    takeToken('upload:' + clientIp(request), 20, 60000);
    const type = request.headers.get('content-type') ?? '';
    if (!type.startsWith('multipart/form-data')) throw new DomainError('INVALID_INPUT', 400);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    // Signed-in only, and capped while streaming: the multipart envelope may add up to 64 KB.
    const body = await readBody(request, MAX_BYTES + 64 * 1024);
    const form = await new Response(body, { headers: { 'content-type': type } })
      .formData()
      .catch(() => {
        throw new DomainError('INVALID_INPUT', 400);
      });
    const file = form.get('photo');
    if (!(file instanceof File)) throw new DomainError('INVALID_INPUT', 400);
    if (file.size > MAX_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 413);
    return json(service.saveUpload(user.id, new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    return failure(e);
  }
}
