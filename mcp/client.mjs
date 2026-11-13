// Authenticated HTTP client for the NimBill MCP agent.
import { agentDataDir, signNimiqMessage } from "./wallet.mjs";

export const DEFAULT_NIMBILL_URL = "https://nimbill.mblob.me";
const SESSION_COOKIE = "nimbill_session";
const REQUEST_TIMEOUT_MS = 20_000;

export class NimBillAgentClient {
  constructor(wallet, { baseUrl, dataDir } = {}) {
    this.wallet = wallet;
    this.baseUrl = (baseUrl || process.env.NIMBILL_URL || DEFAULT_NIMBILL_URL).replace(/\/+$/, "");
    this.dataDir = dataDir || agentDataDir();
    this.cookie = "";
    this.signingIn = null;
  }

  async rawRequest(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(this.cookie ? { cookie: this.cookie } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      });
    } catch (e) {
      throw Object.assign(new Error(`NimBill at ${this.baseUrl} is unreachable (${e.name === "TimeoutError" ? "timed out" : e.message})`), {
        code: "NETWORK",
      });
    }
    // Pick out our session cookie; a response can set several cookies.
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const pair = sc.split(";")[0];
      if (pair.startsWith(`${SESSION_COOKIE}=`)) this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  /** Sign in to NimBill using the agent's Nimiq Ed25519 wallet. Concurrent callers share one sign-in. */
  async ensureSignedIn() {
    if (this.cookie) return;
    this.signingIn ??= this.signIn().finally(() => {
      this.signingIn = null;
    });
    return this.signingIn;
  }

  async signIn() {
    const ch = await this.rawRequest("/api/auth/challenge");
    if (ch.status !== 200 || typeof ch.body?.message !== "string") {
      throw new Error(`Could not get a NimBill sign-in challenge from ${this.baseUrl}`);
    }
    const signature = signNimiqMessage(ch.body.message, this.wallet.secretKey);
    const vr = await this.rawRequest("/api/auth/verify", {
      method: "POST",
      body: { message: ch.body.message, publicKey: this.wallet.publicKeyHex, signature },
    });
    if (vr.status !== 200 || !this.cookie) {
      throw new Error(`NimBill wallet sign-in failed: ${vr.body?.error?.message || vr.status}`);
    }
    return vr.body.merchant;
  }

  /** Perform an API call, signing in first (and retrying once if the session expired). */
  async request(path, { method = "GET", body, auth = false } = {}) {
    if (auth) await this.ensureSignedIn();
    let res = await this.rawRequest(path, { method, body });
    if (auth && res.status === 401) {
      this.cookie = "";
      await this.ensureSignedIn();
      res = await this.rawRequest(path, { method, body });
    }
    if (res.status >= 400 || res.body === null) {
      const msg = res.body?.error?.message || `HTTP ${res.status} on ${method} ${path}`;
      throw Object.assign(new Error(msg), { code: res.body?.error?.code || "API_ERROR", status: res.status });
    }
    return res.body;
  }
}
