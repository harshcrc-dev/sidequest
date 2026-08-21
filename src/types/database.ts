// Hand-written types mirroring the Supabase schema in
// supabase/migrations/001_initial_schema.sql. Kept in sync manually; if you
// regenerate types with the Supabase CLI, replace this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  home_city: string | null;
  home_country: string | null;
  home_lat: number | null;
  home_lng: number | null;
  onboarding_completed: boolean;
  preferences: Json;
  created_at: string;
  updated_at: string;
}

export type TripRow = {
  id: string;
  user_id: string;
  title: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  budget: string | null;
  travel_style: string | null;
  preferences: Json;
  itinerary: Json;
  ai_model: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type SearchRow = {
  id: string;
  user_id: string | null;
  query: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  filters: Json;
  created_at: string;
}

export type AiGenerationRow = {
  id: string;
  user_id: string | null;
  trip_id: string | null;
  provider: string | null;
  model: string | null;
  request_type: string | null;
  input: Json;
  output: Json;
  status: string;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
}

export type GeocodeCacheRow = {
  cache_key: string;
  place_name: string;
  city: string;
  country: string | null;
  latitude: number;
  longitude: number;
  updated_at: string;
}

export type ApiRateLimitRow = {
  key_hash: string;
  request_count: number;
  window_started_at: string;
}

type TableConfig<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableConfig<ProfileRow, Partial<ProfileRow> & { id: string }, Partial<ProfileRow>>;
      trips: TableConfig<
        TripRow,
        Partial<TripRow> & { user_id: string; title: string },
        Partial<TripRow>
      >;
      searches: TableConfig<SearchRow, Partial<SearchRow>, Partial<SearchRow>>;
      ai_generations: TableConfig<
        AiGenerationRow,
        Partial<AiGenerationRow>,
        Partial<AiGenerationRow>
      >;
      geocode_cache: TableConfig<
        GeocodeCacheRow,
        Partial<GeocodeCacheRow> & { cache_key: string; place_name: string; city: string },
        Partial<GeocodeCacheRow>
      >;
      api_rate_limits: TableConfig<
        ApiRateLimitRow,
        Partial<ApiRateLimitRow> & { key_hash: string },
        Partial<ApiRateLimitRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      consume_api_quota: {
        Args: { p_key_hash: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      merge_profile_preferences: {
        Args: { p_patch: Json };
        Returns: ProfileRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
