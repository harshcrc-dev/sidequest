// A resolved real-world place. Sidequest treats every destination as a set of
// coordinates plus human-readable labels, so any city on earth is supported
// without a hardcoded whitelist.
export interface Location {
  city: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}
