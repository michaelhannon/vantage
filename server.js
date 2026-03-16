/**
 * VANTAGE — Anthropic Proxy Server
 * Direct connection to Anthropic (no IP proxy)
 */

const express = require("express");
const cors = require("cors");
const https = require("https");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, mode: "direct" }));

app.post("/api/anthropic/*", (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set" } });
  }

  const path = req.params[0];
  const body = JSON.stringify(req.body);

  console.log(`[vantage] POST /v1/${path} — direct`);

  const options = {
    hostname: "api.anthropic.com",
    port: 443,
    path: `/v1/${path}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => { data += chunk; });
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        res.status(apiRes.statusCode).json(parsed);
      } catch (e) {
        console.error("[vantage] Parse error:", e.message, "Raw:", data.substring(0, 300));
        res.status(502).json({ error: { message: "Parse error", raw: data.substring(0, 300) } });
      }
    });
  });

  apiReq.on("error", (err) => {
    console.error("[vantage] Error:", err.message);
    res.status(502).json({ error: { message: err.message } });
  });

  apiReq.write(body);
  apiReq.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n◈ VANTAGE proxy running on port ${PORT}`);
  console.log(`  Mode: direct (no IP proxy)\n`);
});
