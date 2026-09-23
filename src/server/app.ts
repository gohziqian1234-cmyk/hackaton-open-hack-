// The service every route uses: B2C core (service.ts) + partner portal (partners.ts).
import { getDb } from './db';
import { Partners } from './partners';

export class App extends Partners {}

export const openService = () => new App(getDb());
