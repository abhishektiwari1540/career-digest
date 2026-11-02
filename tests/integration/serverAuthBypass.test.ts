import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app, { getAuthUser } from "../../src/server.js";

test("Integration Test: API Gateway, Authentication & Route Protection", async (t) => {
  let server: http.Server;
  let baseUrl: string;

  await t.test("Setup test HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  await t.test("1. Spoofed headers ('x-user-email', 'x-user-id') MUST NOT authenticate", async () => {
    const fakeReq = {
      headers: {
        "x-user-email": "abhishektiwari1540@gmail.com",
        "x-user-id": "usr_hacker_impersonator",
      },
    } as any;

    const user = getAuthUser(fakeReq);
    assert.strictEqual(
      user,
      null,
      "getAuthUser must return null when only unauthenticated custom headers are supplied"
    );
  });

  await t.test("2. Unauthenticated POST /api/publish-now MUST be rejected with 401", async () => {
    const res = await fetch(`${baseUrl}/api/publish-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "devto",
        postText: "Unauthorized spam post attempt",
      }),
    });

    assert.strictEqual(
      res.status,
      401,
      `Unauthenticated /api/publish-now must return 401 Unauthorized, got: ${res.status}`
    );
  });

  await t.test("3. Unauthenticated POST /api/upload MUST be rejected with 401", async () => {
    const formData = new FormData();
    const blob = new Blob(["Sample unauthorized document text content"], { type: "text/plain" });
    formData.append("file", blob, "unauthorized.txt");

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: formData,
    });

    assert.strictEqual(
      res.status,
      401,
      `Unauthenticated /api/upload must return 401 Unauthorized, got: ${res.status}`
    );
  });

  await t.test("4. Fake social handshake trying to claim root admin email MUST NOT grant admin", async () => {
    const res = await fetch(`${baseUrl}/api/auth/social/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        email: "admin@example.com",
      }),
    });

    const data = await res.json();
    if (data.success && data.user) {
      assert.notStrictEqual(
        data.user.role,
        "projectadmin",
        "Social handshake must not grant projectadmin without verified token"
      );
      assert.strictEqual(
        data.user.is_root_owner,
        false,
        "Social handshake must not set is_root_owner to true"
      );
    }
  });

  await t.test("Teardown HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

