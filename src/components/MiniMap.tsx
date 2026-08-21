import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ItineraryItem } from "../types";
import { Icon } from "./Icon";

function clearMapRef(ref: React.RefObject<L.Map | null>, map: L.Map) {
  if (ref.current === map) ref.current = null;
}

// Real interactive map built on Leaflet + OpenStreetMap tiles (no API key).
// Draws a numbered route through the itinerary and links markers to the
// list via activeId / onHover, keeping the interface the SVG version had.
export function MiniMap({
  items,
  activeId,
  onHover,
}: {
  items: ItineraryItem[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  // Create the map once.
  useEffect(() => {
    const container = elRef.current;
    const markers = markersRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: false,
      touchZoom: true,
      dragging: true,
      doubleClickZoom: true,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    // Container size can settle after mount / layout; keep tiles correct.
    const invalidate = () => map.invalidateSize();
    const t = setTimeout(invalidate, 80);
    const ro = new ResizeObserver(invalidate);
    ro.observe(container);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      map.remove();
      clearMapRef(mapRef, map);
      markers.clear();
    };
  }, []);

  // Draw markers + route whenever the itinerary changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || items.length === 0) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline) map.removeLayer(layer);
    });

    const validItems = items.filter(
      (item) =>
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng) &&
        Math.abs(item.lat) <= 90 &&
        Math.abs(item.lng) <= 180 &&
        !(item.lat === 0 && item.lng === 0),
    );
    const latlngs: L.LatLngExpression[] = validItems.map((item) => [item.lat, item.lng]);
    if (latlngs.length === 0) return;

    const routeGroups = new Map<number, typeof validItems>();
    validItems.forEach((item) => {
      const day = item.day ?? 1;
      const group = routeGroups.get(day) ?? [];
      group.push(item);
      routeGroups.set(day, group);
    });
    routeGroups.forEach((routeItems) => {
      if (routeItems.length < 2) return;
      L.polyline(routeItems.map((item) => [item.lat, item.lng] as L.LatLngExpression), {
        color: "#2f6b46",
        weight: 3,
        opacity: 0.85,
        dashArray: "1 9",
        lineCap: "round",
      }).addTo(map);
    });

    validItems.forEach((item, n) => {
      const icon = L.divIcon({
        className: "map-pin",
        html: `<span class="map-pin__num">${n + 1}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([item.lat, item.lng], { icon, title: item.place })
        .addTo(map)
        .bindTooltip(`${item.title} · ${item.place}`, { direction: "top", offset: [0, -12] });
      marker.on("mouseover", () => onHoverRef.current(item.id));
      marker.on("mouseout", () => onHoverRef.current(null));
      markersRef.current.set(item.id, marker);
    });

    if (latlngs.length === 1) map.setView(latlngs[0], 14);
    else map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36], maxZoom: 15 });
    // Tiles can render at 0 size if the panel was hidden; nudge after paint.
    const timer = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(timer);
  }, [items]);

  // Reflect the active list item onto the map.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (el) el.classList.toggle("on", id === activeId);
      marker.setZIndexOffset(id === activeId ? 1000 : 0);
    });
  }, [activeId]);

  if (items.length === 0) return null;

  return (
    <div className="map">
      <div
        ref={elRef}
        className="map__leaflet"
        style={{ height: 420 }}
        role="img"
        aria-label="Route map"
      />
      <div className="map__badge">
        <span className="map__badge-icon">
          <Icon name="route" size={15} />
        </span>
        <span className="map__badge-label">Route</span>
        <span className="map__badge-sep" />
        <b className="map__badge-count">
          {items.length} <span>stops</span>
        </b>
      </div>
      {items.length > 1 && (
        <ol className="map__legs">
          {items.slice(0, -1).map((item, i) => (
            <li key={item.id} className="map__leg">
              <span className="map__leg-num">{i + 1}</span>
              <span className="map__leg-from">{item.title}</span>
              <Icon name="arrow" size={13} className="map__leg-arrow" />
              <span className="map__leg-to">{items[i + 1].title}</span>
              {item.routeToNext && (
                <span className="map__leg-meta">{item.routeToNext.durationMinutes} min</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
