"use client";

import { useEffect, useRef, useState } from "react";

type Coords = { lat: number; lng: number };

type Props = {
  /** Nominatim geocode query (full address or city/state). */
  geocodeQuery: string | null;
  /** Marker tooltip label (PUBLIC = full address; CITY_ONLY = city/state). */
  tooltipLabel: string | null;
};

function buildOpenStreetMapEmbedUrl({ lat, lng }: Coords) {
  // Small bounding box around the point. This is purely for display.
  const delta = 0.01;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  const params = new URLSearchParams({
    bbox: `${left},${bottom},${right},${top}`,
    layer: "mapnik"
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

export function LocationMap({ geocodeQuery, tooltipLabel }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [resolved, setResolved] = useState<Coords | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) setIsInView(true);
      },
      { rootMargin: "200px 0px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Resolve coordinates lazily via server endpoint (no direct third-party calls from client).
  useEffect(() => {
    if (!isInView) return;
    if (resolved) return;
    if (!geocodeQuery) {
      setStatus("not_found");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    fetch(`/api/osm-geocode?address=${encodeURIComponent(geocodeQuery)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const lat = Number(j?.lat);
        const lng = Number(j?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setResolved({ lat, lng });
          setStatus("found");
        } else {
          setStatus("not_found");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("not_found");
      });

    return () => {
      cancelled = true;
    };
  }, [isInView, resolved, geocodeQuery]);

  // If we have no resolvable location, show the required calm fallback.
  if (!resolved && (status === "not_found" || !geocodeQuery)) {
    return (
      <div ref={hostRef} className="fnm-text-sm fnm-muted fnm-prose">
        Map location unavailable for this listing.
      </div>
    );
  }

  const src = resolved ? buildOpenStreetMapEmbedUrl(resolved) : null;
  const label = (tooltipLabel?.trim() ? tooltipLabel.trim() : geocodeQuery ?? "Location").slice(0, 200);

  return (
    <div ref={hostRef}>
      {isInView && src ? (
        <div className="fnm-mapWrap" aria-label="Location map">
          <iframe className="fnm-mapFrame" title="Location map" loading="lazy" referrerPolicy="no-referrer" src={src} />
          <div className="fnm-mapMarker" title={label} aria-label={label} />
        </div>
      ) : (
        <div className="fnm-mapFrame" />
      )}
      <noscript>
        <div className="fnm-text-sm fnm-muted fnm-mt-sm fnm-prose">
          JavaScript is required to load the interactive map.
        </div>
      </noscript>
    </div>
  );
}


