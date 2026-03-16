/**
 * VANTAGE — Anthropic Proxy Server
 * Routes Claude API calls through RoyalIP proxies.
 */

const express = require("express");
const cors = require("cors");
const https = require("https");
const http = require("http");
const { HttpsProxyAgent } = require("https-proxy-agent");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const PROXIES = [
  "http://149.18.53.147:12323",
  "http://223.29.147.62:12323",
  "http://37.218.215.228:12323",
];

const PORT = process.env.PORT || 3000;

let proxyIndex = 0;
function nextProxy() {
  const proxy = PROXIES[proxyIndex % PROXIES.length];
  proxyIndex++;
  return proxy;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, proxies: PROXIES.length }));

app.post("/api/anthropic/*", (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set" } });
  }

  const path = req.params[0];
  const proxy = nextProxy();
  const body = JSON.stringify(req.body);
  const agent = new HttpsProxyAgent(proxy);

  console.log(`[vantage] POST /v1/${path} → via ${proxy}`);

  const options = {
    hostname: "api.anthropic.com",
    port: 443,
    path: `/v1/${path}`,
    method: "POST",
    agent: agent,
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
        console.error("[vantage] Parse error:", e.message, "Raw:", data.substring(0, 200));
        res.status(502).json({ error: { message: "Bad response from upstream", raw: data.substring(0, 200) } });
      }
    });
  });

  apiReq.on("error", (err) => {
    console.error("[vantage] Request error:", err.message);
    res.status(502).json({ error: { message: err.message, proxy } });
  });

  apiReq.write(body);
  apiReq.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n◈ VANTAGE proxy running on port ${PORT}`);
  console.log(`  Rotating across ${PROXIES.length} proxy IPs\n`);
});
