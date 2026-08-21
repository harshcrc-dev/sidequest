export function health(): { ok: boolean; service: string; aiReady: boolean };
export function searchEvents(location: {
  latitude: number;
  longitude: number;
}): Promise<unknown[]>;
export function chat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { webSearch?: boolean; format?: "json" | "plan" },
): Promise<string>;
export function generateSidequestPlan(input: Record<string, unknown>): Promise<unknown>;
export function logGeneration(input: Record<string, unknown>): Promise<void>;
export function validateGenerateInput(input: unknown): string | null;
export function bearerFromHeader(headerValue: string | undefined | null): string | null;
export function config(): {
  apiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  provider: string;
  model: string;
};