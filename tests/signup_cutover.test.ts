import test from "node:test";
import assert from "node:assert/strict";
import { processPropertySignup } from "../src/property_signup_route";
import { InfraiError, type InfraiLike } from "../src/infrai_client";

function stubInfrai(options?: { captchaReject?: boolean }): InfraiLike {
  return {
    captcha: {
      verify: async () => {
        if (options?.captchaReject) {
          throw new InfraiError("CAPTCHA_REJECTED", "captcha rejected", 422);
        }
        return { verified: true };
      }
    },
    auth: {
      user: {
        create: async () => ({ user_id: "user_prop_123" })
      },
      session: {
        create: async () => ({ session_id: "sess_123" })
      }
    }
  };
}

test("accepts a verified property signup and enables all requested property workflows", async () => {
  const result = await processPropertySignup(
    {
      propertyName: "Riverstone Flats",
      managerName: "Avery Cole",
      managerEmail: "avery@example.com",
      password: "winter-checkout-lane-2024",
      captchaWidgetRecordId: "widget-record-1",
      captchaToken: "token-ok",
      ip: "203.0.113.10",
      maintenanceRequestsEnabled: true,
      tenantDocumentsEnabled: true,
      inspectionRemindersEnabled: true
    },
    stubInfrai()
  );

  assert.equal(result.status, 201);
  assert.deepEqual(result.body.property.features, [
    "maintenance_requests",
    "tenant_documents",
    "inspection_reminders"
  ]);
  assert.equal(result.body.account.userId, "user_prop_123");
  assert.equal(result.body.migration.rollbackPath, "re-enable_previous_captcha_secret");
});

test("blocks signup when captcha verification is rejected", async () => {
  const result = await processPropertySignup(
    {
      propertyName: "Riverstone Flats",
      managerName: "Avery Cole",
      managerEmail: "avery@example.com",
      password: "winter-checkout-lane-2024",
      captchaWidgetRecordId: "widget-record-1",
      captchaToken: "token-low-score",
      ip: "203.0.113.10",
      maintenanceRequestsEnabled: true,
      tenantDocumentsEnabled: false,
      inspectionRemindersEnabled: true
    },
    stubInfrai({ captchaReject: true })
  );

  assert.deepEqual(result, {
    status: 422,
    body: {
      state: "signup_blocked",
      reason: "captcha_rejected"
    }
  });
});
