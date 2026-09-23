// The service every route uses: B2C core (service.ts) + partner portal (partners.ts) +
// marketplace (market.ts) + v2 drops, checkout and physical claims (drops.ts).
import { getDb } from './db';
import { Drops } from './drops';

export class App extends Drops {}

export const openService = () => new App(getDb());
