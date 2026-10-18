// Saved servers ("profiles") for the web client.
//
// A profile is a named ID/relay server as the user typed it, with the same
// rules as the desktop client's server settings: every address is optional. An
// empty ID server means RustDesk's public server, an empty relay means the ID
// server's host, and an empty key means RustDesk's public key. The browser turns
// the addresses into the WebSocket URLs it connects to (see resolveServer).
// Profiles belong to the signed-in console user and live in the console database
// (WebClientProfileController), so they follow the account to any browser; only
// the last-used choice is kept per browser. The console's own server is always
// available as the default and is never stored as a profile.
import { tl } from '../i18n';
import { wsEndpoint } from '../core/ws-endpoint';

export type ServerProfile = {
  id: number;
  name: string;
  /** host, host:port or a ws(s):// URL; '' = RustDesk's public server. */
  idServer: string;
  /** Same forms; '' = the ID server's host. */
  relayServer: string;
  /** base64 ed25519 public key; '' = RustDesk's public key. */
  serverKey: string;
};

export type ProfileFields = Omit<ServerProfile, 'id'>;

export type ProfileEnv = {
  profiles?: ServerProfile[];
  csrf?: string;
  profilesUrl?: string;
};

/** The desktop client's defaults (hbb_common::config RENDEZVOUS_SERVERS / RS_PUB_KEY). */
export const DEFAULT_ID_HOST = 'rs-ny.rustdesk.com';
export const DEFAULT_SERVER_KEY = 'OeVuKk5nlHiXp+APNn0Y3pC1Iwpwn44JGqrQCsWqmBw=';

const SELECTED_KEY = 'cortendesk.rdserver.selected';

/**
 * The connection settings a profile stands for. An empty relay stays empty: like
 * the desktop client, the session then uses the relay the ID server assigns.
 */
export function resolveServer(p: Pick<ServerProfile, 'idServer' | 'relayServer' | 'serverKey'>): { wsIdUrl: string; wsRelayUrl: string; serverKeyB64: string } {
  return {
    wsIdUrl: wsEndpoint(p.idServer.trim() || DEFAULT_ID_HOST, 'id'),
    wsRelayUrl: p.relayServer.trim() ? wsEndpoint(p.relayServer, 'relay') : '',
    serverKeyB64: p.serverKey.trim() || DEFAULT_SERVER_KEY,
  };
}

export class ProfileError extends Error {}

export class ServerProfiles {
  private list: ServerProfile[];

  constructor(private readonly env: ProfileEnv) {
    this.list = [...(env.profiles ?? [])];
  }

  all(): ServerProfile[] {
    return this.list;
  }

  /** The profile picked in this browser, or null for the console's own server. */
  selected(): ServerProfile | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SELECTED_KEY);
    } catch {
      /* storage unavailable — fall back to the default server */
    }
    const id = raw ? Number(raw) : NaN;
    return this.list.find((p) => p.id === id) ?? null;
  }

  select(id: number | null): void {
    try {
      if (id === null) localStorage.removeItem(SELECTED_KEY);
      else localStorage.setItem(SELECTED_KEY, String(id));
    } catch {
      /* non-fatal */
    }
  }

  async save(fields: ProfileFields, id?: number): Promise<ServerProfile> {
    const saved = await this.request<ServerProfile>(id === undefined ? 'POST' : 'PUT', id, fields);
    this.list = this.list.filter((p) => p.id !== saved.id).concat(saved).sort((a, b) => a.name.localeCompare(b.name));
    return saved;
  }

  async remove(id: number): Promise<void> {
    await this.request<{ ok: boolean }>('DELETE', id);
    this.list = this.list.filter((p) => p.id !== id);
    if (this.selected() === null) this.select(null);
  }

  private async request<T>(method: 'POST' | 'PUT' | 'DELETE', id?: number, body?: ProfileFields): Promise<T> {
    const base = this.env.profilesUrl ?? '/webclient/profiles';
    const res = await fetch(id === undefined ? base : `${base}/${id}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': this.env.csrf ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = tl('profile_request_failed');
      try {
        const data = (await res.json()) as { message?: string; errors?: Record<string, string[]> };
        message = Object.values(data.errors ?? {})[0]?.[0] ?? data.message ?? message;
      } catch {
        /* not JSON — keep the generic message */
      }
      throw new ProfileError(message);
    }
    return (await res.json()) as T;
  }
}

type Attrs = Record<string, string>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

/**
 * The manage dialog: list, add, edit and delete saved servers. `defaults` are
 * this console's own values, offered as a starting point for a new profile.
 * onChange runs after anything is saved or removed so the picker can refresh.
 */
export function openProfileDialog(store: ServerProfiles, defaults: Omit<ProfileFields, 'name'>, onChange: () => void): void {
  const backdrop = h('div', { class: 'rd-pf-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': tl('server_profiles') });
  const dialog = h('div', { class: 'rd-pf-dialog' });
  backdrop.append(dialog);
  document.body.append(backdrop);

  let editing: ServerProfile | 'new' | null = null;

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  function close(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });

  function header(): HTMLElement {
    const closeBtn = h('button', { type: 'button', class: 'rd-pf-x', 'aria-label': tl('profile_close') }, '×');
    closeBtn.addEventListener('click', close);
    return h('div', { class: 'rd-pf-head' }, h('h3', {}, tl('server_profiles')), closeBtn);
  }

  function renderList(): void {
    dialog.replaceChildren(header(), h('p', { class: 'rd-pf-help' }, tl('server_profiles_help')));
    const profiles = store.all();
    if (!profiles.length) {
      dialog.append(h('p', { class: 'rd-pf-empty' }, tl('no_server_profiles_yet')));
    }
    for (const p of profiles) {
      const edit = h('button', { type: 'button', class: 'rd-chip' }, tl('profile_edit'));
      const del = h('button', { type: 'button', class: 'rd-chip rd-pf-del' }, tl('profile_delete'));
      edit.addEventListener('click', () => {
        editing = p;
        renderForm();
      });
      del.addEventListener('click', () => {
        if (!window.confirm(tl('delete_profile_confirm', { name: p.name }))) return;
        del.disabled = true;
        store.remove(p.id).then(
          () => {
            renderList();
            onChange();
          },
          (e: Error) => window.alert(e.message),
        );
      });
      dialog.append(
        h('div', { class: 'rd-pf-item' },
          h('div', { class: 'rd-pf-main' }, h('strong', {}, p.name), h('span', { class: 'rd-pf-sub' }, p.idServer || tl('default_rustdesk_server'))),
          edit, del),
      );
    }
    const add = h('button', { type: 'button', class: 'rd-chip rd-chip-solid' }, tl('add_server_profile'));
    add.addEventListener('click', () => {
      editing = 'new';
      renderForm();
    });
    dialog.append(h('div', { class: 'rd-pf-actions' }, add));
  }

  function field(label: string, name: string, value: string, placeholder = ''): { row: HTMLElement; input: HTMLInputElement } {
    const input = h('input', { type: 'text', name, autocomplete: 'off', spellcheck: 'false', placeholder });
    input.value = value;
    return { row: h('label', { class: 'rd-pf-field' }, h('span', {}, label), input), input };
  }

  function renderForm(): void {
    const current = editing === 'new' || editing === null ? null : editing;
    const name = field(tl('profile_name'), 'name', current?.name ?? '');
    const idUrl = field(tl('profile_id_url'), 'idServer', current?.idServer ?? '', DEFAULT_ID_HOST);
    const relayUrl = field(tl('profile_relay_url'), 'relayServer', current?.relayServer ?? '', 'hbbr.example.com');
    const key = field(tl('profile_key'), 'serverKey', current?.serverKey ?? '', DEFAULT_SERVER_KEY);
    const error = h('div', { class: 'rd-pf-error', role: 'alert', hidden: '' });

    const fill = h('button', { type: 'button', class: 'rd-pf-link' }, tl('profile_use_console_values'));
    fill.addEventListener('click', () => {
      idUrl.input.value = defaults.idServer;
      relayUrl.input.value = defaults.relayServer;
      key.input.value = defaults.serverKey;
    });
    const save = h('button', { type: 'submit', class: 'rd-chip rd-chip-solid' }, tl('profile_save'));
    const cancel = h('button', { type: 'button', class: 'rd-chip' }, tl('profile_cancel'));
    cancel.addEventListener('click', () => {
      editing = null;
      renderList();
    });

    const form = h('form', { class: 'rd-pf-form', novalidate: '' },
      name.row, idUrl.row, relayUrl.row, key.row,
      h('p', { class: 'rd-pf-help' }, tl('profile_url_hint')), fill, error,
      h('div', { class: 'rd-pf-actions' }, cancel, save));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      error.hidden = true;
      save.disabled = true;
      const fields: ProfileFields = {
        name: name.input.value.trim(),
        idServer: idUrl.input.value.trim(),
        relayServer: relayUrl.input.value.trim(),
        serverKey: key.input.value.trim(),
      };
      store.save(fields, current?.id).then(
        (saved) => {
          if (!current) store.select(saved.id);
          editing = null;
          renderList();
          onChange();
        },
        (err: Error) => {
          error.textContent = err.message;
          error.hidden = false;
          save.disabled = false;
        },
      );
    });
    dialog.replaceChildren(header(), h('h4', { class: 'rd-pf-sub-title' }, current ? tl('profile_edit') : tl('add_server_profile')), form);
    name.input.focus();
  }

  renderList();
}
