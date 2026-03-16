/**
 * VANTAGE — Anthropic Proxy Server
 * Routes Claude API calls through RoyalIP proxies.
 * Configured for Railway deployment via environment variables.
 */

const express    = require("express");
const cors       = require("cors");
const fetch      = (...a) => import("node-fetch").then(({ default: f }) => f(...a));
const { HttpsProxyAgent } = require("https-proxy-agent");

// ── Config (set these in Railway environment variables) ───────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const PROXIES = [
  "http://149.18.53.147:12323",
  "http://223.29.147.62:12323",
  "http://37.218.215.228:12323",
];

const PORT = process.env.PORT || 3000;

// ── Helpers ───────────────────────────────────────────────────────────────────
let proxyIndex = 0;

/** Round-robin across the three proxy IPs */
function nextProxy() {
  const proxy = PROXIES[proxyIndex % PROXIES.length];
  proxyIndex++;
  return proxy;
}

// ── Server ────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

/** Health check */
app.get("/health", (_req, res) => res.json({ ok: true, proxies: PROXIES.length }));

/** Proxy endpoint — forwards /api/anthropic/* to Anthropic via a rotating proxy IP */
app.post("/api/anthropic/*", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY env var not set" } });
  }

  const path   = req.params[0];
  const target = `https://api.anthropic.com/v1/${path}`;
  const proxy  = nextProxy();
  const agent  = new HttpsProxyAgent(proxy);

  console.log(`[vantage] POST /v1/${path} → via ${proxy}`);

  try {
    const upstream = await fetch(target, {
      method: "POST",
      agent,
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("[vantage] Anthropic error:", data);
      return res.status(upstream.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error("[vantage] Proxy error:", err.message);
    res.status(502).json({ error: { message: err.message, proxy } });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n◈ VANTAGE proxy running on port ${PORT}`);
  console.log(`  Rotating across ${PROXIES.length} proxy IPs\n`);
});
