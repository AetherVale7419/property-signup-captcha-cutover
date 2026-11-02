import { z } from "zod";
import { createHash } from "node:crypto";
import { createInfraiClient, InfraiError, type InfraiLike } from "./infrai_client";

const propertySignupSchema = z.object({
  propertyName: z.string().min(2),
  managerName: z.string().min(2),
  managerEmail: z.string().email(),
  password: z.string().min(12),
  captchaWidgetRecordId: z.string().min(1),
  captchaToken: z.string().min(1),
  ip: z.string().min(3),
  maintenanceRequestsEnabled: z.boolean(),
  tenantDocumentsEnabled: z.boolean(),
  inspectionRemindersEnabled: z.boolean()
});

export type PropertySignupInput = z.infer<typeof propertySignupSchema>;

export type SignupDecision =
  | {
      status: 201;
      body: {
        state: "signup_accepted";
        property: {
          name: string;
          features: string[];
        };
        account: {
          userId: string;
          sessionCreated: boolean;
        };
        migration: {
          incumbent: "turnstile/recaptcha";
          nextStep: "switch_signup_verification";
          rollbackPath: "re-enable_previous_captcha_secret";
        };
      };
    }
  | {
      status: 422;
      body: {
        state: "signup_blocked";
        reason: "captcha_rejected";
      };
    };

function featureList(input: PropertySignupInput): string[] {
  const features: string[] = [];
  if (input.maintenanceRequestsEnabled) features.push("maintenance_requests");
  if (input.tenantDocumentsEnabled) features.push("tenant_documents");
  if (input.inspectionRemindersEnabled) features.push("inspection_reminders");
  return features;
}

function signupIdempotencyKey(input: PropertySignupInput): string {
  return createHash("sha256")
    .update(`${input.managerEmail}:${input.propertyName}`)
    .digest("hex");
}

export async function processPropertySignup(
  rawInput: unknown,
  infrai: InfraiLike = createInfraiClient()
): Promise<SignupDecision> {
  const input = propertySignupSchema.parse(rawInput);
  const features = featureList(input);

  try {
    await infrai.captcha.verify({
      widget_record_id: input.captchaWidgetRecordId,
      token: input.captchaToken,
      vendor: "hcaptcha",
      ip: input.ip,
      action: "property_signup",
      score_threshold: 0.5
    });
  } catch (error) {
    if (error instanceof InfraiError) {
      return {
        status: 422,
        body: {
          state: "signup_blocked",
          reason: "captcha_rejected"
        }
      };
    }
    throw error;
  }

  const createdUser = await infrai.auth.user.create({
    email: input.managerEmail,
    password: input.password,
    name: input.managerName,
    metadata: {
      property_name: input.propertyName,
      enabled_modules: features,
      signup_origin: "property_portal"
    },
    mode: "default_vendor",
    idempotency_key: signupIdempotencyKey(input)
  }) as { user_id?: string; id?: string };

  const userId = createdUser.user_id ?? createdUser.id;
  if (!userId) {
    throw new Error("Missing user id in create response");
  }

  await infrai.auth.session.create({
    user_id: userId,
    method: "password",
    require_mfa: false
  });

  return {
    status: 201,
    body: {
      state: "signup_accepted",
      property: {
        name: input.propertyName,
        features
      },
      account: {
        userId,
        sessionCreated: true
      },
      migration: {
        incumbent: "turnstile/recaptcha",
        nextStep: "switch_signup_verification",
        rollbackPath: "re-enable_previous_captcha_secret"
      }
    }
  };
}
