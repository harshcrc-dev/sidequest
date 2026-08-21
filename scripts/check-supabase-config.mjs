import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnv(path) {
  try {
    const values = new Map();
    for (const rawLine of readFileSync(resolve(path), "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
    return { exists: true, values };
  } catch {
    return { exists: false, values: new Map() };
  }
}

const frontend = readEnv(".env");
const backend = readEnv("server/.env");
const projectUrl = frontend.values.get("VITE_SUPABASE_URL") ?? "";
const serverUrl = backend.values.get("SUPABASE_URL") ?? "";
const publicKey = frontend.values.get("VITE_SUPABASE_ANON_KEY") ?? "";
const serviceKey = backend.values.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const checks = [
  ["Root .env file", frontend.exists],
  ["Server environment file", backend.exists],
  ["Frontend project URL", /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)],
  ["Browser publishable/anon key", publicKey.length >= 20],
  ["Backend project URL", serverUrl === projectUrl && serverUrl.length > 0],
  ["Server service-role key", serviceKey.length >= 20],
  ["Service key is server-only", serviceKey !== publicKey && !frontend.values.has("SUPABASE_SERVICE_ROLE_KEY")],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
}

if (checks.some(([, passed]) => !passed)) {
  console.error("\nSupabase configuration is incomplete. Values were not printed.");
  process.exitCode = 1;
} else {
  console.log("\nSupabase environment configuration is ready.");
}