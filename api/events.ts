import { searchEvents } from "./_lib/generate.mjs";
import { allowCors, enforceRateLimit, type ApiRequest, type ApiResponse } from "./_lib/http";

export const config = { maxDuration: 10 };

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!allowCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await enforceRateLimit(req, res, "events", 30))) return;
  const query = new URLSearchParams((req as ApiRequest & { url?: string }).url?.split("?")[1] ?? "");
  const latitude = Number(query.get("lat"));
  const longitude = Number(query.get("lng"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }
  res.status(200).json({ events: await searchEvents({ latitude, longitude }) });
}