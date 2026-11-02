import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  initSecurityEngine,
  loginUser,
  verifyAuthToken,
  isDisposableEmail,
  requestPasswordReset,
  requestActivationOtp,
  handleSocialLogin,
} from "../../src/storage/securityEngine.js";
import { config } from "../../src/config.js";

test("Unit Test: Security Engine & Authentication Hardening", async (t) => {
  await t.test("1. Reject tokens forged with deprecated static fallback secret", () => {
    const deprecatedSecret = "career_digest_master_secret_2026_abhishek";
    const forgedToken = jwt.sign(
      {
        sub: "hacker",
        email: "hacker@example.com",
        role: "projectadmin",
        is_root_owner: true,
      },
      deprecatedSecret,
      { expiresIn: "1h" }
    );

    const verification = verifyAuthToken(forgedToken);
    assert.strictEqual(
      verification.valid,
      false,
      "Tokens signed with deprecated hardcoded secret MUST be rejected"
    );
  });

  await t.test("2. Default hardcoded password '12345678' must NOT be active", async () => {
    await initSecurityEngine();
    const loginResult = await loginUser("abhishektiwari1540@gmail.com", "12345678");
    assert.strictEqual(
      loginResult.success,
      false,
      "Default password '12345678' must NOT authenticate any user"
    );
  });

  await t.test("3. Password reset MUST NOT leak OTP in debugCode in responses", async () => {
    const res = await requestPasswordReset("testuser@example.com");
    // Even if user does not exist or exists, debugCode must be undefined in response
    assert.strictEqual(
      res.debugCode,
      undefined,
      "API response must NEVER return debugCode containing the plain OTP"
    );
  });

  await t.test("4. Activation OTP request MUST NOT leak OTP in debugCode", async () => {
    const res = await requestActivationOtp({
      requesterEmail: "legit.user@gmail.com",
      machineId: "machine_123",
    });
    assert.strictEqual(
      res.debugCode,
      undefined,
      "Activation request must NEVER return debugCode containing the plain OTP"
    );
  });

  await t.test("5. Disposable emails must be rejected strictly", () => {
    const disposable = isDisposableEmail("bot@mailinator.com");
    assert.strictEqual(disposable.isDisposable, true);

    const legit = isDisposableEmail("engineer@company.com");
    assert.strictEqual(legit.isDisposable, false);
  });

  await t.test("6. Social login handshake without verified token must NOT grant admin", async () => {
    const res = await handleSocialLogin({
      provider: "google",
      email: "attacker@gmail.com",
    });

    if (res.success && res.token) {
      const verified = verifyAuthToken(res.token);
      assert.strictEqual(verified.valid, true);
      assert.strictEqual(
        verified.user?.role !== "projectadmin",
        true,
        "Arbitrary social login must NOT grant projectadmin role"
      );
      assert.strictEqual(
        verified.user?.is_root_owner,
        false,
        "Arbitrary social login must NOT set is_root_owner to true"
      );
    }
  });
});

