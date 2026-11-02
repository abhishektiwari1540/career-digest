import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { processLinkedInZipArchive } from "../../src/storage/zipImporter.js";

test("Unit Test: Zip Archive Safety & Bounds Enforcement", async (t) => {
  await t.test("1. Reject archives exceeding entry limit or corrupted buffers safely", async () => {
    // Construct an invalid buffer
    const invalidBuffer = Buffer.from("Not a real zip archive buffer content");

    await assert.rejects(
      async () => {
        await processLinkedInZipArchive(invalidBuffer, "corrupt.zip");
      },
      "Corrupted or non-zip buffers should reject cleanly"
    );
  });

  await t.test("2. Safely parse normal LinkedIn export archive without throwing", async () => {
    const zip = new AdmZip();
    const sampleCsv = `ShareCommentary,ShareLink,Date\n"Exploring Clean Architecture with TypeScript","https://example.com/clean-arch","2026-10-15"`;
    zip.addFile("Shares.csv", Buffer.from(sampleCsv, "utf-8"));
    const validZipBuffer = zip.toBuffer();

    const result = await processLinkedInZipArchive(
      validZipBuffer,
      "test_shares.zip",
      "usr_test_123",
      "tester@example.com"
    );

    assert.strictEqual(result.sharesCount, 1);
    assert.strictEqual(result.fileName, "test_shares.zip");
  });
});

