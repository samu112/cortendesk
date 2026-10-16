/**
 * Translation lookup for the web client.
 *
 * The strings live in Laravel's lang files (lang/<locale>/webclient.php); the
 * console page injects the active language, with English filling any gap, as
 * `window.__RD__.messages`. The session worker has no `window`, so the UI
 * hands it the same table with the connect command (setCatalog).
 *
 * Placeholders use Laravel's ":name" syntax, so the same catalog is checked by
 * `php artisan lang:check`.
 */

export type Catalog = Record<string, string>;
export type Params = Record<string, string | number>;

let workerCatalog: Catalog | undefined;

/** Use this table instead of window.__RD__.messages (session worker). */
export function setCatalog(catalog: Catalog | undefined): void {
  workerCatalog = catalog;
}

function catalog(): Catalog {
  if (workerCatalog) return workerCatalog;
  const rd = (globalThis as { __RD__?: { messages?: Catalog } }).__RD__;
  return rd?.messages ?? {};
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/:([A-Za-z_]+)/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** The translation for a key, or the key itself when none is loaded. */
export function tl(key: string, params?: Params): string {
  return fill(catalog()[key] ?? key, params);
}

/**
 * Lower-case a label for use mid-sentence ("Peer enabled audio"). English and
 * Hungarian write common nouns in lower case; German capitalizes them, so the
 * label is left alone there.
 */
export function lowerLabel(text: string): string {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
  return /^(en|hu)/i.test(lang || 'en') ? text.toLowerCase() : text;
}

/** Like tl(), for a "singular|plural" message: the first form for 1, else the second. */
export function tn(key: string, count: number, params?: Params): string {
  const forms = (catalog()[key] ?? key).split('|');
  const form = forms.length > 1 && count !== 1 ? forms[1] : forms[0];
  return fill(form, { count, ...params });
}
