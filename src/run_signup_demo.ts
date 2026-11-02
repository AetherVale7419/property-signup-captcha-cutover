import { processPropertySignup } from "./property_signup_route";

async function main(): Promise<void> {
  const managerEmail = process.env.DEMO_MANAGER_EMAIL;
  const captchaWidgetRecordId = process.env.DEMO_CAPTCHA_WIDGET_RECORD_ID;
  const captchaToken = process.env.DEMO_CAPTCHA_TOKEN;
  if (!managerEmail || !captchaWidgetRecordId || !captchaToken) {
    throw new Error("Set DEMO_MANAGER_EMAIL, DEMO_CAPTCHA_WIDGET_RECORD_ID, and DEMO_CAPTCHA_TOKEN");
  }

  const result = await processPropertySignup({
    propertyName: "Riverstone Flats",
    managerName: "Avery Cole",
    managerEmail,
    password: "winter-checkout-lane-2024",
    captchaWidgetRecordId,
    captchaToken,
    ip: "203.0.113.10",
    maintenanceRequestsEnabled: true,
    tenantDocumentsEnabled: true,
    inspectionRemindersEnabled: true
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
