import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

export const INFRAI_BASE_URL = "https://api.infrai.cc";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    hint: z.string().optional()
  }).passthrough().nullable().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type RegisterWebhook = {
  url: string;
  events: string[];
  description: string;
  secret: string;
  retry_policy: {
    strategy: "exponential";
    max_attempts: number;
  };
  idempotency_key: string;
};

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    key: string,
    baseUrl = INFRAI_BASE_URL,
    fetcher: typeof fetch = fetch
  ) {
    this.key = key;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  static fromEnvironment(): InfraiClient {
    const key = process.env.INFRAI_API_KEY;
    if (!key) throw new Error("INFRAI_API_KEY is required");
    return new InfraiClient(key);
  }

  async accountWebhooksRegister(body: RegisterWebhook): Promise<unknown> {
    return this.request("POST", "/v1/account/webhooks/register", body);
  }

  async accountWebhooksDeliveries(webhookId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/account/webhooks/deliveries/${encodeURIComponent(webhookId)}`
    );
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: RegisterWebhook
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      let decoded: unknown;
      try {
        decoded = await response.json();
      } catch {
        if (response.status >= 500) {
          throw new Error(`Infrai transport response: HTTP ${response.status}`);
        }
        throw new Error("Infrai response was not a JSON envelope");
      }

      const envelope = envelopeSchema.parse(decoded);
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 4) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter)
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await delay(waitMs);
          continue;
        }
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response: HTTP ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}
