import { runSecondBrainADKAgent } from "./llm/secondBrainAgent.js";

async function testADK() {
  console.log("\n======================================================");
  console.log("🤖 Testing Google ADK Second Brain Agent & Multi-Agent Flow");
  console.log("======================================================\n");

  const sampleDailyInput = `
Today is 2026-09-21.
Collected Trends:
1. "PostgreSQL 17 Performance Benchmarks & EXPLAIN ANALYZE Tips"
2. "Building High-Throughput Microservices with Node.js & TypeScript"

Candidate Profile:
- Skills: TypeScript, Node.js, React, PostgreSQL, REST APIs, Microservices
- Target: Tech Lead / Senior Full Stack Engineer
  `;

  const output = await runSecondBrainADKAgent(sampleDailyInput);

  console.log("\n--- ADK Agent Execution Result ---");
  if (output) {
    console.log(output);
  } else {
    console.log("ADK Agent run returned fallback / mock output (API key or runner status checked).");
  }
}

testADK().catch((err) => {
  console.error("ADK Test error:", err);
});
