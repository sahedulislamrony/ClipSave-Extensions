import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';

const HOST_NAME = 'link.clipsave.helper';

/** Close the port this long after the last job, so the helper and the service worker can exit. */
const IDLE_MS = 30_000;

/** A message the helper sent that isn't the reply to a request. */
export type HelperEvent = { id: string; type: string; [key: string]: unknown };

export class HelperError extends Error {
  constructor(message: string, readonly missing: boolean) {
    super(message);
  }
}

type Pending = { resolve: (value: Record<string, unknown>) => void; reject: (reason: HelperError) => void };

/** The stdin/stdout link to the desktop helper. An open port keeps Chrome's service worker alive. */
export class Helper {
  private port: Browser.runtime.Port | null = null;
  private pending = new Map<string, Pending>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;

  constructor(
    private onEvent: (event: HelperEvent) => void,
    private onLost: (missing: boolean) => void,
    private isBusy: () => boolean,
  ) {}

  request(message: { type: string; [key: string]: unknown }): Promise<Record<string, unknown>> {
    const id = `r${++this.nextId}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ ...message, id });
    }).finally(() => this.touch()) as Promise<Record<string, unknown>>;
  }

  send(message: { id: string; type: string; [key: string]: unknown }) {
    this.connect().postMessage(message);
    this.touch();
  }

  /** Call whenever work finishes, so the idle countdown restarts. */
  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.isBusy() || this.pending.size > 0) return this.touch();
      this.port?.disconnect();
      this.port = null;
    }, IDLE_MS);
  }

  private connect(): Browser.runtime.Port {
    if (this.port) return this.port;
    const port = browser.runtime.connectNative(HOST_NAME);
    port.onMessage.addListener((raw) => {
      const message = raw as HelperEvent;
      const waiting = this.pending.get(message.id);
      if (!waiting) return this.onEvent(message);
      this.pending.delete(message.id);
      if (message.type === 'error') waiting.reject(new HelperError(String(message.message), false));
      else waiting.resolve(message);
    });
    port.onDisconnect.addListener(() => {
      // Chrome reports the reason on lastError, Firefox on the port itself.
      const reason =
        browser.runtime.lastError?.message ?? (port as unknown as { error?: Error }).error?.message ?? '';
      const missing = /not found|no such native application|forbidden/i.test(reason);
      if (this.port === port) this.port = null;
      clearTimeout(this.idleTimer);
      for (const { reject } of this.pending.values()) {
        reject(new HelperError(reason || 'The ClipSave Helper stopped.', missing));
      }
      this.pending.clear();
      this.onLost(missing);
    });
    this.port = port;
    return port;
  }
}
