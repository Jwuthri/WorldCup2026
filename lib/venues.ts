/** The 16 WC2026 venues, keyed by FIFA's CityName. Coordinates for weather + travel math. */
export type Venue = {
  city: string;
  stadium: string;
  lat: number;
  lon: number;
  altitudeM: number;
  /** 'roofed' = retractable/fixed roof, typically closed w/ climate control — outdoor weather barely applies */
  roof: "open" | "roofed";
  tz: string;
  /** approx WC2026 configured capacity */
  capacity: number;
};

export const VENUES: Record<string, Venue> = {
  "Mexico City": { city: "Mexico City", stadium: "Estadio Azteca", lat: 19.3029, lon: -99.1505, altitudeM: 2226, roof: "open", tz: "America/Mexico_City", capacity: 83264 },
  "Guadalajara": { city: "Guadalajara", stadium: "Estadio Akron", lat: 20.6817, lon: -103.4626, altitudeM: 1560, roof: "open", tz: "America/Mexico_City", capacity: 48071 },
  "Monterrey": { city: "Monterrey", stadium: "Estadio BBVA", lat: 25.6693, lon: -100.2442, altitudeM: 540, roof: "open", tz: "America/Monterrey", capacity: 53500 },
  "Los Angeles": { city: "Los Angeles", stadium: "SoFi Stadium", lat: 33.9535, lon: -118.3392, altitudeM: 30, roof: "roofed", tz: "America/Los_Angeles", capacity: 70240 },
  "San Francisco Bay Area": { city: "San Francisco Bay Area", stadium: "Levi's Stadium", lat: 37.403, lon: -121.9696, altitudeM: 5, roof: "open", tz: "America/Los_Angeles", capacity: 68500 },
  "Seattle": { city: "Seattle", stadium: "Lumen Field", lat: 47.5952, lon: -122.3316, altitudeM: 5, roof: "open", tz: "America/Los_Angeles", capacity: 68740 },
  "New Jersey": { city: "New Jersey", stadium: "MetLife Stadium", lat: 40.8135, lon: -74.0744, altitudeM: 3, roof: "open", tz: "America/New_York", capacity: 82500 },
  "Boston": { city: "Boston", stadium: "Gillette Stadium", lat: 42.0909, lon: -71.2643, altitudeM: 89, roof: "open", tz: "America/New_York", capacity: 65878 },
  "Philadelphia": { city: "Philadelphia", stadium: "Lincoln Financial Field", lat: 39.9008, lon: -75.1675, altitudeM: 12, roof: "open", tz: "America/New_York", capacity: 69796 },
  "Miami": { city: "Miami", stadium: "Hard Rock Stadium", lat: 25.958, lon: -80.2389, altitudeM: 3, roof: "open", tz: "America/New_York", capacity: 65326 },
  "Atlanta": { city: "Atlanta", stadium: "Mercedes-Benz Stadium", lat: 33.7554, lon: -84.401, altitudeM: 297, roof: "roofed", tz: "America/New_York", capacity: 71000 },
  "Houston": { city: "Houston", stadium: "NRG Stadium", lat: 29.6847, lon: -95.4107, altitudeM: 15, roof: "roofed", tz: "America/Chicago", capacity: 72220 },
  "Kansas City": { city: "Kansas City", stadium: "Arrowhead Stadium", lat: 39.0489, lon: -94.4839, altitudeM: 265, roof: "open", tz: "America/Chicago", capacity: 76416 },
  "Dallas": { city: "Dallas", stadium: "AT&T Stadium", lat: 32.7473, lon: -97.0945, altitudeM: 168, roof: "roofed", tz: "America/Chicago", capacity: 80000 },
  "Toronto": { city: "Toronto", stadium: "BMO Field", lat: 43.6332, lon: -79.4186, altitudeM: 76, roof: "open", tz: "America/Toronto", capacity: 45500 },
  "Vancouver": { city: "Vancouver", stadium: "BC Place", lat: 49.2767, lon: -123.1119, altitudeM: 9, roof: "roofed", tz: "America/Vancouver", capacity: 54500 },
};

export function haversineKm(a: Venue, b: Venue): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
