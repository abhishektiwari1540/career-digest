import { evaluateVoiceConsistency, extractAndSaveVoiceProfile, getFewShotPastPosts, getVoiceProfile } from "./llm/voiceProfile.js";

async function testVoiceSystem() {
  console.log("\n======================================================");
  console.log("🎙️ Testing Voice Profile Fingerprint & Style System");
  console.log("======================================================\n");

  // 1. Extract / Get Voice Profile
  console.log("[1/3] Fetching / Extracting Voice Profile Fingerprint...");
  const profile = await getVoiceProfile();
  console.log("Tone:", profile.tone);
  console.log("Avg Sentence Length:", profile.avgSentenceLength);
  console.log("Avoid List:", profile.avoidList.join(", "));
  console.log("Formatting Rules:", profile.formattingRules);

  // 2. Test Few-Shot Retrieval
  console.log("\n[2/3] Retrieving Few-Shot Past Post Examples for 'PostgreSQL'...");
  const fewShotPosts = await getFewShotPastPosts("PostgreSQL 17 query performance", 2);
  console.log(`Found ${fewShotPosts.length} few-shot post examples.`);

  // 3. Test Voice Consistency Critic
  console.log("\n[3/3] Evaluating Voice Consistency Critic on draft post...");
  const sampleDraft = `🚀 Stop guessing why your Node.js microservices are slow under high load.
Key takeaway: Run EXPLAIN (ANALYZE, SERIALIZE) on PostgreSQL 17 to measure serialization overhead.

What optimizations have made the biggest difference in your TypeScript backends? 👇`;

  const consistency = await evaluateVoiceConsistency(sampleDraft);
  console.log(`Consistency Score: ${(consistency.score * 100).toFixed(1)}%`);
  console.log(`Status: ${consistency.passed ? "PASSED" : "FAILED"}`);
  console.log(`Feedback: ${consistency.feedback}`);

  console.log("\n======================================================");
  console.log("✅ Voice Profile Fingerprint System Verified!");
  console.log("======================================================\n");
}

testVoiceSystem().catch((err) => {
  console.error("Voice system test failed:", err);
});
