import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { authService } from "./auth";
import type { ItineraryItem, PlannerMode, SavedTrip } from "../types";
import type { Json, TripRow } from "../types/database";

// ---------------------------------------------------------------------------
// Trip persistence backed by Supabase. The `trips` table holds queryable
// columns (title, city, coordinates, status...) plus two jsonb columns: the
// itinerary items and a small bag of display metadata used by the UI.
// RLS guarantees a user can only ever read or mutate their own rows.
// ---------------------------------------------------------------------------

export class TripError extends Error {}

interface TripDisplayMeta {
  mode?: PlannerMode;
  origin?: string;
  countryCode?: string;
  image?: string;
  costLow?: number;
  costHigh?: number;
  startTime?: string;
  endTime?: string;
  feedback?: SavedTrip["feedback"];
}

// The data needed to create a persisted trip from a generated plan.
export interface NewTripInput {
  title: string;
  mode: PlannerMode;
  origin: string;
  city?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  image: string;
  costLow: number;
  costHigh: number;
  startTime: string;
  endTime: string;
  itinerary: ItineraryItem[];
  aiModel?: string;
}

function rowToSavedTrip(row: TripRow): SavedTrip {
  const meta = (row.preferences as TripDisplayMeta) ?? {};
  const itinerary = (row.itinerary as unknown as ItineraryItem[]) ?? [];
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: meta.mode ?? "city",
    origin: meta.origin ?? row.city ?? "",
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    countryCode: meta.countryCode,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    image: meta.image ?? "",
    costLow: meta.costLow ?? 0,
    costHigh: meta.costHigh ?? 0,
    startTime: meta.startTime ?? "",
    endTime: meta.endTime ?? "",
    itinerary,
    status: (row.status as SavedTrip["status"]) ?? "saved",
    feedback: meta.feedback,
    createdAt: row.created_at,
  };
}

export const tripsService = {
  async list(userId: string): Promise<SavedTrip[]> {
    if (!isSupabaseConfigured) return [];
    try {
      await authService.requireVerifiedUser(userId);
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToSavedTrip);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[trips] list", error);
      throw new TripError("We couldn't load your sidequests right now. Please try again.");
    }
  },

  async create(userId: string, input: NewTripInput): Promise<SavedTrip> {
    if (!isSupabaseConfigured) throw new TripError("Accounts aren't set up yet.");
    const meta: TripDisplayMeta = {
      mode: input.mode,
      origin: input.origin,
      countryCode: input.countryCode,
      image: input.image,
      costLow: input.costLow,
      costHigh: input.costHigh,
      startTime: input.startTime,
      endTime: input.endTime,
    };
    try {
      await authService.requireVerifiedUser(userId);
      const { data, error } = await supabase
        .from("trips")
        .insert({
          user_id: userId,
          title: input.title,
          city: input.city ?? input.origin,
          country: input.country ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          duration_days: null,
          travel_style: input.mode,
          preferences: meta as unknown as Json,
          itinerary: input.itinerary as unknown as Json,
          ai_model: input.aiModel ?? null,
          status: "saved",
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToSavedTrip(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[trips] create", error);
      throw new TripError("We couldn't save this sidequest right now. Please try again.");
    }
  },

  async setFeedback(
    userId: string,
    tripId: string,
    feedback: NonNullable<SavedTrip["feedback"]>,
  ): Promise<void> {
    try {
      await authService.requireVerifiedUser(userId);
      const { data: current, error: readError } = await supabase
        .from("trips")
        .select("preferences")
        .eq("id", tripId)
        .single();
      if (readError) throw readError;
      const meta = { ...((current?.preferences as TripDisplayMeta) ?? {}), feedback };
      const { error } = await supabase
        .from("trips")
        .update({ preferences: meta as unknown as Json, status: "completed" })
        .eq("id", tripId)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[trips] setFeedback", error);
      throw new TripError("We couldn't save your rating right now. Please try again.");
    }
  },

  async remove(userId: string, tripId: string): Promise<void> {
    try {
      await authService.requireVerifiedUser(userId);
      const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[trips] remove", error);
      throw new TripError("We couldn't remove that sidequest right now. Please try again.");
    }
  },
};
