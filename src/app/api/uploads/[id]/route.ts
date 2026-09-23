import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { openService } from '../../../../server/app';
import { currentUser, failure } from '../../../../server/http';
import { DomainError } from '../../../../server/service';
import { uploadsDir } from '../../../../server/market';
import { clientIp, takeToken } from '../../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Serves a listing photo with the type recorded at upload time. Drafts are visible to their uploader only. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    takeToken('img:' + clientIp(request), 300, 60000);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new DomainError('NOT_FOUND', 404);
    const service = openService();
    const user = await currentUser(service);
    const photo = service.photo(id, user?.id);
    const path = resolve(photo.path);
    if (!path.startsWith(resolve(uploadsDir()) + sep)) throw new DomainError('NOT_FOUND', 404);
    const bytes = await readFile(path).catch(() => {
      throw new DomainError('NOT_FOUND', 404);
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': photo.mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
