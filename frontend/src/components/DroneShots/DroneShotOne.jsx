import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import useSound from "use-sound";
import courseIntroSound from "../../assets/course_intro.mp3";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function DroneShotOne({
  startPosition,
  endPosition,
  checkpoints = [],
  locationName = "Unknown Location",
  onAnimationComplete,
}) {
  console.log("DroneShotOne received props:", {
    startPosition,
    endPosition,
    checkpointsCount: checkpoints?.length || 0,
    locationName,
  });

  // Store the location name in state to ensure it doesn't get overridden
  const [displayLocationName, setDisplayLocationName] = useState(locationName);

  // Add additional debug logging for locationName
  useEffect(() => {
    console.log("DroneShotOne locationName value:", locationName);
    // Ensure we're using the passed prop, not any hardcoded value
    if (locationName !== displayLocationName) {
      console.log("Updating displayLocationName to:", locationName);
      setDisplayLocationName(locationName);
    }

    // Check if there are any hardcoded values overriding locationName
    if (document.title.includes("New York")) {
      console.warn(
        "Possible hardcoded New York reference detected in document title"
      );
    }
  }, [locationName, displayLocationName]);

  const mapContainerRef = useRef();
  const mapRef = useRef();
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showLocationName, setShowLocationName] = useState(false);

  // Initialize the useSound hook
  const [playCourseIntro] = useSound(courseIntroSound);

  // Format checkpoints to ensure they're in [longitude, latitude] format
  const formatCheckpoints = () => {
    return checkpoints
      .map((checkpoint) => {
        // If checkpoint is already an array [lng, lat], return as is
        if (Array.isArray(checkpoint)) {
          return checkpoint;
        }
        // If checkpoint is an object with latitude/longitude properties
        else if (
          checkpoint &&
          typeof checkpoint === "object" &&
          "longitude" in checkpoint &&
          "latitude" in checkpoint
        ) {
          // Return only the coordinates, ignoring the position property
          return [checkpoint.longitude, checkpoint.latitude];
        }
        // If format is unknown, log error and return null
        else {
          console.error("Invalid checkpoint format:", checkpoint);
          return null;
        }
      })
      .filter((checkpoint) => checkpoint !== null); // Remove any invalid checkpoints
  };

  useEffect(() => {
    // Use provided coordinates or defaults if not available
    const start = startPosition || [-81.1989, 28.6024];
    const end = endPosition || [-81.195, 28.605];
    const formattedCheckpoints = formatCheckpoints();

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
      maxPitch: 85,
      minZoom: initialZoom - 5,
      maxZoom: initialZoom + 5,
      renderWorldCopies: false,
      fadeDuration: 0,
      config: {
        baseMap: {
          lightPreset: "dusk",
        },
      },
    });

    mapRef.current.on("style.load", () => {
      const map = mapRef.current;

      // Optimized fog settings with reduced range
      map.setFog({
        color: "rgb(186, 210, 235)", // light blue
        "high-color": "rgb(36, 92, 223)", // blue
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)", // dark blue-black
        "star-intensity": 0.4, // reduced from 0.6
        range: [0.5, 4], // Reduced range (was [1, 8])
      });

      // Add terrain with reduced exaggeration
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1?optimize=true",
        tileSize: 256,
        maxzoom: 12, // Reduced from 14
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.2 }); // Reduced from 1.5

      // Create waypoints array for the route including checkpoints
      const waypoints = [start];

      // Add all checkpoints in their original order
      if (formattedCheckpoints && formattedCheckpoints.length > 0) {
        waypoints.push(...formattedCheckpoints);
      }

      // Add end position as the last point
      waypoints.push(end);

      // Add markers for start, checkpoints, and end with simplified styles
      new mapboxgl.Marker({ color: "#00FF00" }).setLngLat(start).addTo(map);

      // Add checkpoint markers
      if (formattedCheckpoints && formattedCheckpoints.length > 0) {
        formattedCheckpoints.forEach((checkpoint, index) => {
          // Create a DOM element for the marker
          const el = document.createElement("div");
          el.className = "checkpoint-marker";
          el.style.backgroundColor = "#ffdd00";
          el.style.width = "20px";
          el.style.height = "20px";
          el.style.borderRadius = "50%";
          el.style.border = "3px solid #ff9900";

          // Add checkpoint number
          const label = document.createElement("div");
          label.textContent = (index + 1).toString();
          label.style.color = "#000";
          label.style.fontWeight = "bold";
          label.style.fontSize = "12px";
          label.style.textAlign = "center";
          label.style.lineHeight = "20px";
          el.appendChild(label);

          // Add marker to map
          new mapboxgl.Marker(el).setLngLat(checkpoint).addTo(map);
        });
      }

      new mapboxgl.Marker({ color: "#FF0000" }).setLngLat(end).addTo(map);

      // Add a line for the complete route with optimized settings
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: waypoints,
          },
        },
      });

      // Simplified route layers with performance-friendly settings
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#4882c5",
          "line-width": 8, // Reduced from 12
          "line-opacity": 0.5, // Reduced from 0.6
          "line-blur": 2, // Reduced from 3
        },
      });

      map.addLayer({
        id: "route-core",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#2b98f0",
          "line-width": 3, // Reduced from 4
          "line-dasharray": [0.5, 1.5],
          "line-opacity": 0.7,
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
    let lastTimestamp = 0;

    mapRef.current.once("idle", () => {
      // Play the course intro sound when the map is ready
      playCourseIntro();

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

      // Using the same animation steps but with smoother transitions and optimized altitude values
      const animations = [
        {
          duration: 5000.0,
          animate: (phase) => {
            const easeInOutQuint = (t) =>
              t < 0.5
                ? 16 * t * t * t * t * t
                : 1 - Math.pow(-2 * t + 2, 5) / 2;

            // Keep focus on the course with a closer side view
            const courseProgress = 0.3 + phase * 0.4; // View middle section of course
            const viewPoint = [
              start[0] + directionVector[0] * courseProgress,
              start[1] + directionVector[1] * courseProgress,
            ];

            // Orbit closer to the course with smaller radius
            const angle = phase * Math.PI * 1.5; // Less than full rotation
            const orbitRadius = 0.003; // Smaller orbit radius

            const position = [
              viewPoint[0] + Math.cos(angle) * orbitRadius,
              viewPoint[1] + Math.sin(angle) * orbitRadius,
            ];

            // Keep camera looking at course
            const courseTargetPoint = [
              viewPoint[0] + normalizedDirection[0] * 0.001,
              viewPoint[1] + normalizedDirection[1] * 0.001,
            ];

            // Lower altitude to stay focused on course
            const altitude = lerp(280, 350, easeInOutQuint(phase));
            updateCameraPosition(position, altitude, courseTargetPoint);
          },
          prevPosition: null,
          prevAltitude: null,
          prevTarget: null,
        },
        {
          duration: 5000.0,
          animate: (phase) => {
            // Final approach to the end point
            const startPos = [
              end[0] - normalizedDirection[0] * 0.01,
              end[1] - normalizedDirection[1] * 0.01,
            ];

            const position = lerp(startPos, end, phase);

            // Look slightly ahead of our position to see the finish
            const target = [
              end[0] + normalizedDirection[0] * 0.001,
              end[1] + normalizedDirection[1] * 0.001,
            ];

            // Stay low to the ground for dramatic finish
            const altitude = lerp(250, 180, phase);

            updateCameraPosition(position, altitude, target);
          },
          prevPosition: null,
          prevAltitude: null,
          prevTarget: null,
        },
      ];

      let finishTimeout;
      let frameCount = 0;
      const frameSkip = 0; // Can be increased to 1 or 2 if needed for performance

      function frame(timestamp) {
        frameCount++;
        if (frameCount % (frameSkip + 1) !== 0) {
          window.requestAnimationFrame(frame);
          return;
        }

        if (animationIndex >= animations.length) {
          // All animations complete
          if (!finishTimeout) {
            finishTimeout = setTimeout(() => {
              onAnimationComplete();
            }, 1500);
          }
          return;
        }

        // Calculate elapsed time with timestamp clamping for stability
        const elapsed = lastTimestamp
          ? Math.min(Math.max(timestamp - lastTimestamp, 16), 50)
          : 16.7;
        lastTimestamp = timestamp;

        const current = animations[animationIndex];

        if (animationTime < current.duration) {
          const phase = animationTime / current.duration;

          // Apply the animation with motion smoothing
          try {
            current.animate(phase);
          } catch (e) {
            console.error("Animation error:", e);
          }
        }

        animationTime += elapsed;

        if (animationTime > current.duration) {
          animationIndex++;
          animationTime = 0.0;
        }

        window.requestAnimationFrame(frame);
      }

      window.requestAnimationFrame(frame);
    });

    // Show location name with delay for a nice entrance effect
    setTimeout(() => {
      setShowLocationName(true);
    }, 1000);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [
    startPosition,
    endPosition,
    checkpoints,
    onAnimationComplete,
    playCourseIntro,
  ]);

  return (
    <div className="relative w-full h-full">
      <div id="map" ref={mapContainerRef} style={{ height: "100%" }}></div>

      {/* Location Name Overlay with Gradient */}
      <div
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
          height: "300px",
          zIndex: 10,
        }}
      >
        <div
          className={`flex flex-col items-start justify-start p-10 transition-all duration-1000 ease-out ${
            showLocationName
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-10"
          }`}
        >
          <div className="flex flex-col">
            <span className="text-blue-300 text-sm font-medium uppercase tracking-widest mb-1">
              Now Racing in...
            </span>
            <h2 className="text-5xl font-extrabold text-white tracking-wide leading-tight">
              {displayLocationName}
            </h2>
            <div className="flex items-center mt-3">
              <div className="h-1 w-24 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
              <div className="h-1 w-12 bg-gradient-to-r from-blue-300 to-transparent rounded-full ml-1"></div>
            </div>
          </div>
        </div>
      </div>

      {loadingProgress < 100 && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
          <div className="w-64 bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
