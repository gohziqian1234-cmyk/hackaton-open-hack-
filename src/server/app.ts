// The service every route uses: B2C core (service.ts) + partner portal (partners.ts) + marketplace (market.ts).
import { getDb } from './db';
import { Market } from './market';

export class App extends Market {}

export const openService = () => new App(getDb());
