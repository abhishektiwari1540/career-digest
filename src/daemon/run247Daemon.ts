import cron from "node-cron";
import app from "../server.js";
import { startSelfUpdatingEngine, forceTriggerSelfUpdate } from "../engine/selfUpdatingEngine.js";

const PORT = process.env.PORT || 3005;

console.log(`\n======================================================`);
console.log(`⚡ INITIALIZING 24/7 AUTONOMOUS SECOND BRAIN & SKILL GROWTH DAEMON`);
console.log(`======================================================\n`);

app.listen(PORT, () => {
  console.log(`🚀 Web Dashboard & REST API: http://localhost:${PORT}`);
  console.log(`⏰ Scheduled Daily Digest Cron: 0 9 * * * (Asia/Kolkata timezone)`);
  console.log(`🔄 Continuous Self-Updating Engine Ticker: 60-second loop active\n`);

  // Start continuous self-updating engine
  startSelfUpdatingEngine();

  // Trigger daily cron job at 9:00 AM IST
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log(`[24/7 daemon] Executing 9:00 AM IST daily auto-update & social publishing cycle...`);
      await forceTriggerSelfUpdate();
    },
    { timezone: "Asia/Kolkata" }
  );
});
