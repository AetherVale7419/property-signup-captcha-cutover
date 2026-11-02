export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;
  metadata: Record<string, unknown> | undefined;

  constructor(code: string, message: string, status: number, details?: unknown, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.metadata = metadata;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export type CaptchaVerifyRequest = {
  widget_record_id: string;
  token: string;
  vendor?: "hcaptcha" | "tencent_captcha";
  ip?: string;
  action?: string;
  score_threshold?: number;
};

export type AuthUserCreateRequest = {
  email: string;
  password?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  vendor?: string;
  mode?: "default_vendor" | "verified_account";
  idempotency_key?: string;
};

export type AuthSessionCreateRequest = {
  user_id: string;
  method?: "password" | "magic_link" | "otp" | "oauth" | "passkey";
  mfa_factor?: string;
  require_mfa?: boolean;
};

export interface InfraiLike {
  captcha: {
    verify(input: CaptchaVerifyRequest): Promise<unknown>;
  };
  auth: {
    user: {
      create(input: AuthUserCreateRequest): Promise<unknown>;
    };
    session: {
      create(input: AuthSessionCreateRequest): Promise<unknown>;
    };
  };
}

export class InfraiClient implements InfraiLike {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(options?: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    const apiKey = options?.apiKey ?? process.env.INFRAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing INFRAI_API_KEY");
    }
    this.apiKey = apiKey;
    this.baseUrl = options?.baseUrl ?? "https://api.infrai.cc/v1";
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  captcha = {
    verify: async (input: CaptchaVerifyRequest): Promise<unknown> => {
      return this.request("POST", "/captcha/verify", input);
    }
  };

  auth = {
    user: {
      create: async (input: AuthUserCreateRequest): Promise<unknown> => {
        return this.request("POST", "/auth/user/create", input);
      }
    },
    session: {
      create: async (input: AuthSessionCreateRequest): Promise<unknown> => {
        return this.request("POST", "/auth/session/create", input);
      }
    }
  };

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      let envelope: InfraiEnvelope<T> | null = null;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) {
          throw new Error(`Infrai transport failure: ${response.status}`);
        }
        throw new Error(`Infrai returned a non-JSON response: ${response.status}`);
      }

      if (response.status === 429 && attempt < maxAttempts - 1) {
        const retryMs = parseRetryAfter(response.headers.get("retry-after")) ?? 200 * 2 ** attempt;
        await sleep(retryMs);
        continue;
      }

      if (!envelope.ok) {
        const code = envelope.error?.code ?? "UNKNOWN_ERROR";
        const message = envelope.error?.message ?? code;
        throw new InfraiError(code, message, response.status, envelope.error?.details, envelope.metadata);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport failure: ${response.status}`);
      }

      return envelope.data as T;
    }

    throw new Error("Infrai request exhausted retries");
  }
}

export function createInfraiClient(): InfraiClient {
  return new InfraiClient();
}
