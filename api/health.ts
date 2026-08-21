import { health } from "./_lib/generate.mjs";

interface Res {
  setHeader(key: string, value: string): void;
  status(code: number): Res;
  json(data: unknown): void;
}

export default function handler(_req: unknown, res: Res): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.status(200).json(health());
}
