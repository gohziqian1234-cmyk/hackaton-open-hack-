// Lets plain `node` scripts import the app's TypeScript modules, which use extension-free
// relative imports (bundler style) and plain JSON imports. Node strips the types itself (Node 22.18+ / 24).
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.json')) {
    const result = await next(specifier, context);
    return { ...result, importAttributes: { type: 'json' } };
  }
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\\.{1,2}\\//.test(specifier)) throw e;
    return next(specifier + '.ts', context);
  }
}`),
);
