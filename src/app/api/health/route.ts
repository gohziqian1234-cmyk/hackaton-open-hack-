import { getDb } from '../../../server/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  let db = false;
  try {
    db = !!getDb().prepare('SELECT 1 AS ok').get();
  } catch {
    db = false;
  }
  return Response.json(
    { ok: db, db, demo: process.env.DEMO_MODE !== 'false' },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
