import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function DroneShotOne({
  startPosition,
  endPosition,
  onAnimationComplete,
}) {
  const mapContainerRef = useRef();
  const mapRef = useRef();
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    // Use provided coordinates or defaults if not available
    const start = startPosition || [-81.1989, 28.6024];
    const end = endPosition || [-81.195, 28.605];

    // Calculate center point between start and end for initial view
    const centerLng = (start[0] + end[0]) / 2;
    const centerLat = (start[1] + end[1]) / 2;

    // Calculate distance to determine initial zoom level
    const distance = Math.sqrt(
      Math.pow(start[0] - end[0], 2) + Math.pow(start[1] - end[1], 2)
    );

    // Higher zoom for shorter distances
    const initialZoom = Math.max(16, 20 - distance * 10000);

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      zoom: initialZoom,
      center: [centerLng, centerLat],
      pitch: 85,
      bearing: -177.2,
      style: "mapbox://styles/mapbox/standard",
      interactive: false,
    });

    mapRef.current.on("style.load", () => {
      const map = mapRef.current;

      // Add fog effect
      map.setFog({
        color: "rgb(186, 210, 235)", // light blue
        "high-color": "rgb(36, 92, 223)", // blue
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)", // dark blue-black
        "star-intensity": 0.6, // brightness of stars (0-1)
      });

      // Add terrain
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });

      // Add start and end markers
      new mapboxgl.Marker({ color: "#00FF00" }).setLngLat(start).addTo(map);

      new mapboxgl.Marker({ color: "#FF0000" }).setLngLat(end).addTo(map);

      // Add a line for the route
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [start, end],
          },
        },
      });

      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3B82F6",
          "line-width": 8,
          "line-opacity": 0.8,
        },
      });

      // Progress loader
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          const newValue = prev + 5;
          return newValue <= 100 ? newValue : 100;
        });
      }, 150);

      setTimeout(() => {
        clearInterval(interval);
        setLoadingProgress(100);
      }, 3000);
    });

    function updateCameraPosition(position, altitude, target) {
      const camera = mapRef.current.getFreeCameraOptions();

      camera.position = mapboxgl.MercatorCoordinate.fromLngLat(
        position,
        altitude
      );
      camera.lookAtPoint(target);

      mapRef.current.setFreeCameraOptions(camera);
    }

    let animationIndex = 0;
    let animationTime = 0.0;

    mapRef.current.once("idle", () => {
      const lerp = (a, b, t) => {
        if (Array.isArray(a) && Array.isArray(b)) {
          const result = [];
          for (let i = 0; i < Math.min(a.length, b.length); i++)
            result[i] = a[i] * (1.0 - t) + b[i] * t;
          return result;
        } else {
          return a * (1.0 - t) + b * t;
        }
      };

      // Calculate a direction vector from start to end
      const directionVector = [end[0] - start[0], end[1] - start[1]];

      // Length of the course
      const courseLength = Math.sqrt(
        Math.pow(directionVector[0], 2) + Math.pow(directionVector[1], 2)
      );

      // Normalize the vector
      const normalizedDirection = [
        directionVector[0] / courseLength,
        directionVector[1] / courseLength,
      ];

      // Perpendicular vector for side views (rotate 90 degrees)
      const perpVector = [-normalizedDirection[1], normalizedDirection[0]];

      const animations = [
        {
          duration: 5000.0,
          animate: (phase) => {
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
            // Start high above the starting point, then dive down
            const position = [
              start[0] + normalizedDirection[0] * phase * 0.2,
              start[1] + normalizedDirection[1] * phase * 0.2,
            ];
            const altitude = lerp(2000.0, 300.0, easeOutCubic(phase));
            const target = start;

            updateCameraPosition(position, altitude, target);
          },
        },
        {
          duration: 6000.0,
          animate: (phase) => {
            // Flyover along the course at lower altitude
            const position = [
              start[0] + directionVector[0] * phase,
              start[1] + directionVector[1] * phase,
            ];

            // Look slightly ahead
            const lookAheadFactor = Math.min(0.2, (1 - phase) * 0.3);
            const target = [
              position[0] + normalizedDirection[0] * lookAheadFactor,
              position[1] + normalizedDirection[1] * lookAheadFactor,
            ];

            const altitude = lerp(300, 350, Math.sin(phase * Math.PI));
            updateCameraPosition(position, altitude, target);
          },
        },
        {
          duration: 5000.0,
          animate: (phase) => {
            const easeInOutQuint = (t) =>
              t < 0.5
                ? 16 * t * t * t * t * t
                : 1 - Math.pow(-2 * t + 2, 5) / 2;

            // Side view of the course, moving from midpoint
            const midPoint = [
              start[0] + directionVector[0] * 0.5,
              start[1] + directionVector[1] * 0.5,
            ];

            // Orbit around mid point
            const angle = phase * Math.PI * 2;
            const orbitRadius = 0.005;

            const position = [
              midPoint[0] + Math.cos(angle) * orbitRadius,
              midPoint[1] + Math.sin(angle) * orbitRadius,
            ];

            const altitude = lerp(500, 800, easeInOutQuint(phase));
            updateCameraPosition(position, altitude, midPoint);
          },
        },
        {
          duration: 4000.0,
          animate: (phase) => {
            // Final approach to the end point
            const startPos = [
              end[0] - normalizedDirection[0] * 0.01,
              end[1] - normalizedDirection[1] * 0.01,
            ];

            const position = lerp(startPos, end, phase);
            const altitude = lerp(400, 200, phase);

            updateCameraPosition(position, altitude, end);
          },
        },
      ];

      let lastTime = 0.0;
      let totalDuration = animations.reduce(
        (sum, anim) => sum + anim.duration,
        0
      );
      let finishTimeout;

      function frame(time) {
        if (animationIndex >= animations.length) {
          // All animations complete
          if (!finishTimeout) {
            finishTimeout = setTimeout(() => {
              onAnimationComplete();
            }, 1500);
          }
          return;
        }

        const current = animations[animationIndex];

        if (animationTime < current.duration) {
          const phase = animationTime / current.duration;
          current.animate(phase);
        }

        const elapsed = time - lastTime;
        animationTime += elapsed;
        lastTime = time;

        if (animationTime > current.duration) {
          animationIndex++;
          animationTime = 0.0;
        }

        window.requestAnimationFrame(frame);
      }

      window.requestAnimationFrame(frame);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [startPosition, endPosition, onAnimationComplete]);

  return (
    <div className="relative w-full h-full">
      <div id="map" ref={mapContainerRef} style={{ height: "100%" }}></div>

      {loadingProgress < 100 && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
          <div className="w-64 bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <div className="absolute text-white font-medium text-sm mt-8">
            Preparing drone footage...
          </div>
        </div>
      )}
    </div>
  );
}
