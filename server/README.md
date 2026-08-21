# Sidequest demo backend

A tiny, zero-dependency Node proxy that keeps your AI key **off the browser**.
The app sends planning requests here; the server attaches your secret key and
calls your chosen AI provider (any OpenAI-compatible `/chat/completions` API),
returning only the model's structured text.

## Use your own credentials

1. Get a key from any of these (Gemini and Groq are **free**, no billing):
   - Google Gemini — https://aistudio.google.com/apikey
   - Groq — https://console.groq.com/keys
   - OpenAI — https://platform.openai.com/api-keys
2. Create the server env file from the template:
   ```bash
   cp server/.env.example server/.env
   ```
   In PowerShell, use:
   ```powershell
   Copy-Item server/.env.example server/.env
   ```
3. Open `server/.env` and set **one** key. The server auto-detects the provider:
   - `GEMINI_API_KEY` (free) → `gemini-flash-latest`
   - `GROQ_API_KEY` (free) → `llama-3.3-70b-versatile`
   - `OPENAI_API_KEY` → `gpt-4o-mini`
   - Optional: `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL` to override defaults.
4. Start the backend (Node 18+, no `npm install` needed):
   ```bash
   npm run server
   ```
   It listens on http://localhost:8787. Check http://localhost:8787/api/health.
5. Point the app at the backend. In the project root `.env`:
   ```
   VITE_AI_BACKEND_URL=http://localhost:8787
   ```
   Then restart the app: `npm run dev`.

When `VITE_AI_BACKEND_URL` is set, the app calls this server, so your key is
never exposed to the browser. All providers use `POST /chat/completions` with
JSON mode (`response_format: { type: "json_object" }`).

## Endpoints

- `GET /api/health` → `{ ok, provider, model, hasKey }`
- `POST /api/ai` with `{ "messages": [{ "role": "system"|"user"|"assistant", "content": "..." }] }`
  → `{ "content": "<model text>" }`

## Notes

- CORS is restricted to `ALLOWED_ORIGIN` (defaults to the Vite dev/preview ports).
- For production, deploy this server (or an equivalent function) and set
  `VITE_AI_BACKEND_URL` to its URL. Do not ship a client-side API key.
- Maps use Leaflet with OpenStreetMap tiles, so no map API key is required for
  this low-traffic interactive map. Follow the OpenStreetMap tile usage policy
  before deploying a high-traffic product.
