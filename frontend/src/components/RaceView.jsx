import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

// Define keyframe animations
const flashAnimationStyle = `
@keyframes flash {
  0% { opacity: 0.7; }
  100% { opacity: 0; }
}
`;

export default function RaceView({
  startPosition,
  finishPosition,
  checkpoints = [],
}) {
  // Remove debug logs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [secondCarModelLoaded, setSecondCarModelLoaded] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [raceStarted, setRaceStarted] = useState(false);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [offTrackWarning, setOffTrackWarning] = useState(false);
  const [optimizedCheckpoints, setOptimizedCheckpoints] = useState([]);

  // Initialize carPosition from props or default
  const initialPosition = useMemo(() => {
    const result = startPosition || [-81.1989, 28.6024];
    return result;
  }, [startPosition]);

  // Default finish position if not provided
  const defaultFinishPosition = useMemo(() => {
    // Check if finishPosition is defined and has valid coordinates
    const isValid =
      finishPosition &&
      Array.isArray(finishPosition) &&
      finishPosition.length === 2 &&
      typeof finishPosition[0] === "number" &&
      typeof finishPosition[1] === "number";

    const result = isValid ? finishPosition : [-81.197, 28.6035];
    return result;
  }, [finishPosition]);

  // Directly reference the finish position for clarity
  const actualFinishPosition = useMemo(() => {
    return finishPosition || defaultFinishPosition;
  }, [finishPosition, defaultFinishPosition]);

  // Second car initial offset - slightly to the right of the primary car
  const secondCarInitialOffset = useMemo(() => {
    return [0.00005, 0.00002]; // Offset in [lng, lat]
  }, []);

  // Game state
  const gameState = useRef({
    // Position & motion
    carPosition: initialPosition, // Use memoized initial position
    carHeading: 0, // radians, 0 is north
    carSpeed: 0,
    carVelocity: [0, 0],

    // Second car
    secondCarPosition: [
      initialPosition[0] + secondCarInitialOffset[0],
      initialPosition[1] + secondCarInitialOffset[1],
    ],
    secondCarHeading: 0, // radians, 0 is north
    secondCarSpeed: 0,
    secondCarVelocity: [0, 0],
    secondCarDistance: 0.00008, // Target distance to maintain from primary car

    // Key-based impulses
    forwardImpulse: 0,
    backwardImpulse: 0,

    // Car properties
    mass: 1800,
    wheelbase: 2.78,
    enginePower: 100,
    brakingForce: 6000,
    dragCoefficient: 0.35,
    rollingResistance: 8,
    frictionCoefficient: 20,

    // Movement controls
    controls: {
      forward: false,
      backward: false,
      left: false,
      right: false,
    },

    // Control duration tracking
    keyHoldDuration: {
      forward: 0,
      backward: 0,
    },
    prevControls: {
      forward: false,
      backward: false,
      left: false,
      right: false,
    },

    // Slower top speed
    maxSpeed: 0.000024,

    // Steering & timing
    steeringAngle: 0,
    lastFrame: 0,

    // Model info
    modelLoaded: false,
    secondCarModelLoaded: false,

    // Race progress tracking
    checkpointsPassed: [],
    raceComplete: false,
    raceStartTime: 0,
    raceFinishTime: 0,

    // Store the finish position to use consistently throughout the app
    actualFinishPosition: null, // Will be initialized in useEffect
  });

  // Debug UI state
  const [debugInfo, setDebugInfo] = useState({
    position: initialPosition,
    heading: 0,
    speed: 0,
    activeKeys: [],
    checkpointStatus: [],
    raceTime: 0,
    routeDistance: 0,
  });

  // Race progress state
  const [checkpointStatus, setCheckpointStatus] = useState([]);
  const [raceComplete, setRaceComplete] = useState(false);
  const [raceTime, setRaceTime] = useState(0);

  // Initialize checkpoint status and finish position
  useEffect(() => {
    // Ensure we're using consistent finish position
    gameState.current.actualFinishPosition = actualFinishPosition;

    // Calculate initial heading toward first checkpoint or finish
    let initialHeading = 0;
    if (checkpoints && checkpoints.length > 0) {
      // Head toward first checkpoint
      const dx = checkpoints[0][0] - initialPosition[0];
      const dy = checkpoints[0][1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    } else if (actualFinishPosition) {
      // Head toward finish position
      const dx = actualFinishPosition[0] - initialPosition[0];
      const dy = actualFinishPosition[1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    }

    // Set initial car heading
    gameState.current.carHeading = initialHeading;

    // Apply initial bearing to map if map is ready
    if (mapRef.current) {
      mapRef.current.jumpTo({
        bearing: (initialHeading * 180) / Math.PI,
      });
    }

    if (checkpoints && checkpoints.length > 0) {
      // Create orderedCheckpoints array with properly formatted data
      const orderedCheckpoints = checkpoints.map((checkpoint, index) => ({
        position: checkpoint,
        originalIndex: index,
      }));
      setOptimizedCheckpoints(orderedCheckpoints);

      const initialStatus = orderedCheckpoints.map(() => false);
      setCheckpointStatus(initialStatus);
      gameState.current.checkpointsPassed = initialStatus;
    }
  }, [
    checkpoints,
    finishPosition,
    defaultFinishPosition,
    actualFinishPosition,
    initialPosition,
  ]);

  // Function to reset the race without reloading the page
  const resetRace = () => {
    // Reset race state
    setRaceComplete(false);
    setRaceTime(0);
    setCountdown(3);
    setRaceStarted(false);
    setModelLoaded(false); // Reset model loaded state to trigger countdown
    setSecondCarModelLoaded(false); // Reset second car model loaded state

    // Reset checkpoint status
    const resetStatus = Array(checkpointStatus.length).fill(false);
    setCheckpointStatus(resetStatus);

    // Calculate initial heading toward first checkpoint or finish
    let initialHeading = 0;
    if (checkpoints && checkpoints.length > 0) {
      // Head toward first checkpoint
      const dx = checkpoints[0][0] - initialPosition[0];
      const dy = checkpoints[0][1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    } else if (actualFinishPosition) {
      // Head toward finish position
      const dx = actualFinishPosition[0] - initialPosition[0];
      const dy = actualFinishPosition[1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    }

    // Reset game state
    gameState.current.carPosition = initialPosition;
    gameState.current.carHeading = initialHeading;
    gameState.current.carSpeed = 0;
    gameState.current.carVelocity = [0, 0];

    // Reset second car
    gameState.current.secondCarPosition = [
      initialPosition[0] + secondCarInitialOffset[0],
      initialPosition[1] + secondCarInitialOffset[1],
    ];
    gameState.current.secondCarHeading = initialHeading;
    gameState.current.secondCarSpeed = 0;
    gameState.current.secondCarVelocity = [0, 0];

    gameState.current.forwardImpulse = 0;
    gameState.current.backwardImpulse = 0;
    gameState.current.steeringAngle = 0;
    gameState.current.checkpointsPassed = resetStatus;
    gameState.current.raceComplete = false;
    gameState.current.raceStartTime = 0;
    gameState.current.raceFinishTime = 0;
    gameState.current.modelLoaded = false; // Reset model loaded state
    gameState.current.secondCarModelLoaded = false; // Reset second car model loaded state

    // Reset car position on map with calculated heading
    if (mapRef.current) {
      mapRef.current.jumpTo({
        center: initialPosition,
        bearing: (initialHeading * 180) / Math.PI, // Convert to degrees
        pitch: 55,
      });
    }

    // Force re-initialization of the 3D models
    setTimeout(() => {
      setModelLoaded(true);
      gameState.current.modelLoaded = true;
      setSecondCarModelLoaded(true);
      gameState.current.secondCarModelLoaded = true;
    }, 100);
  };

  // Start the countdown when both models are loaded
  useEffect(() => {
    if (isMapLoaded && modelLoaded && secondCarModelLoaded) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setRaceStarted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isMapLoaded, modelLoaded, secondCarModelLoaded]);

  // Load and display race route
  const fetchAndDisplayRoute = async (map) => {
    try {
      // Use our stored finish position for consistency
      const finishPointToUse = actualFinishPosition;

      // Build waypoints array with checkpoints in the middle
      const waypoints = [initialPosition];

      // Add all checkpoints in between in their original order
      if (checkpoints && checkpoints.length > 0) {
        waypoints.push(...checkpoints);
      }

      // Add finish position as the last point
      waypoints.push(finishPointToUse);

      // Also update the game state
      gameState.current.actualFinishPosition = finishPointToUse;

      // Create a direct line between waypoints (not following roads)
      const routeGeometry = {
        type: "LineString",
        coordinates: waypoints,
      };

      // Store the route coordinates for boundary checking
      setRouteCoordinates(waypoints);

      // Estimate the route distance (straight-line distance between points)
      let totalDistance = 0;
      for (let i = 1; i < waypoints.length; i++) {
        const dx = waypoints[i][0] - waypoints[i - 1][0];
        const dy = waypoints[i][1] - waypoints[i - 1][1];
        // Convert to meters (rough approximation)
        const segmentDistance = Math.sqrt(dx * dx + dy * dy) * 111000;
        totalDistance += segmentDistance;
      }

      // Create ordered checkpoints array with original positions
      const orderedCheckpoints = checkpoints.map((checkpoint, index) => ({
        position: checkpoint,
        originalIndex: index,
      }));

      // Add the route source and layer
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: routeGeometry,
        },
      });

      // Add route layer - a glowing effect with two lines
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
          "line-width": 12,
          "line-opacity": 0.6,
          "line-blur": 3,
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
          "line-width": 4,
          "line-dasharray": [0.5, 1.5],
          "line-opacity": 0.7,
        },
      });

      // Debug drawing - add dots at each coordinate to verify the route
      const debugPoints = {
        type: "FeatureCollection",
        features: waypoints.map((wp, index) => ({
          type: "Feature",
          properties: {
            pointType:
              index === 0
                ? "start"
                : index === waypoints.length - 1
                ? "finish"
                : "checkpoint",
          },
          geometry: {
            type: "Point",
            coordinates: wp,
          },
        })),
      };

      map.addSource("debug-points", {
        type: "geojson",
        data: debugPoints,
      });

      map.addLayer({
        id: "debug-points-layer",
        type: "circle",
        source: "debug-points",
        paint: {
          "circle-radius": 4,
          "circle-color": [
            "match",
            ["get", "pointType"],
            "start",
            "#00ff00",
            "finish",
            "#ff0000",
            "#ffff00",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Add direction arrows along the path
      const coordinates = waypoints;

      // Place arrows at intervals
      if (coordinates.length > 2) {
        // Add arrow source using the route coordinates
        const arrowsSource = {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        };

        // Add arrows at each segment midpoint
        for (let i = 0; i < coordinates.length - 1; i++) {
          const startPoint = coordinates[i];
          const endPoint = coordinates[i + 1];

          // Midpoint of the segment
          const midPoint = [
            (startPoint[0] + endPoint[0]) / 2,
            (startPoint[1] + endPoint[1]) / 2,
          ];

          // Angle from start to end point
          const angle =
            (Math.atan2(
              endPoint[0] - startPoint[0],
              endPoint[1] - startPoint[1]
            ) *
              180) /
            Math.PI;

          arrowsSource.data.features.push({
            type: "Feature",
            properties: {
              angle: angle,
              segmentIndex: i,
            },
            geometry: {
              type: "Point",
              coordinates: midPoint,
            },
          });
        }

        // Add arrows source to map
        map.addSource("route-arrows", arrowsSource);

        // Add symbol layer for arrows
        map.addLayer({
          id: "route-arrows-layer",
          type: "symbol",
          source: "route-arrows",
          layout: {
            "icon-image": "arrow",
            "icon-size": 0.7,
            "icon-rotate": ["get", "angle"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        // Load arrow image
        map.loadImage(
          "https://docs.mapbox.com/mapbox-gl-js/assets/arrow.png",
          (error, image) => {
            if (error) throw error;
            map.addImage("arrow", image);
            map.triggerRepaint();
          }
        );
      }

      // Add start marker
      const startEl = document.createElement("div");
      startEl.className = "start-marker";
      startEl.style.backgroundColor = "#4caf50";
      startEl.style.width = "24px";
      startEl.style.height = "24px";
      startEl.style.borderRadius = "50%";
      startEl.style.border = "3px solid white";
      startEl.style.boxShadow = "0 0 12px rgba(76, 175, 80, 0.8)";
      startEl.innerHTML =
        '<div style="color:white;font-weight:bold;text-align:center;line-height:24px;">S</div>';

      new mapboxgl.Marker(startEl).setLngLat(initialPosition).addTo(map);

      // Add markers for checkpoints in their original order
      if (checkpoints && checkpoints.length > 0) {
        checkpoints.forEach((checkpoint, index) => {
          // Create a DOM element for the marker
          const el = document.createElement("div");
          el.className = "checkpoint-marker";
          el.style.backgroundColor = "#ffdd00";
          el.style.width = "20px";
          el.style.height = "20px";
          el.style.borderRadius = "50%";
          el.style.border = "3px solid #ff9900";
          el.style.boxShadow = "0 0 10px rgba(255, 217, 0, 0.7)";

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

      // Add finish marker
      const finishEl = document.createElement("div");
      finishEl.className = "finish-marker";
      finishEl.style.backgroundColor = "#ff3b3b";
      finishEl.style.width = "24px";
      finishEl.style.height = "24px";
      finishEl.style.borderRadius = "50%";
      finishEl.style.border = "3px solid white";
      finishEl.style.boxShadow = "0 0 12px rgba(255, 59, 59, 0.8)";
      finishEl.innerHTML =
        '<div style="color:white;font-weight:bold;text-align:center;line-height:24px;">F</div>';

      // Make sure we use the same finish position here
      console.log("Adding finish marker at:", finishPointToUse);
      new mapboxgl.Marker(finishEl).setLngLat(finishPointToUse).addTo(map);

      setRouteLoaded(true);

      // Store the route distance in the state for display
      setDebugInfo((prev) => ({
        ...prev,
        routeDistance: totalDistance,
      }));
    } catch (error) {
      console.error("Error creating race route:", error);
    }
  };

  // Function to calculate distance between two points (in longitude/latitude)
  const calculateDistance = (point1, point2) => {
    // Simple Euclidean distance - for more precise calculations we'd use the Haversine formula
    const dx = point1[0] - point2[0];
    const dy = point1[1] - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Check for checkpoint and finish line crossings
  const checkRaceProgress = () => {
    const carPosition = gameState.current.carPosition;
    const checkpointRadius = 0.00015; // Detection radius for checkpoints, ~15m

    // Always use the finish position from game state
    const finishPos = gameState.current.actualFinishPosition;

    // Check each checkpoint
    if (optimizedCheckpoints && optimizedCheckpoints.length > 0) {
      let allPassed = true;

      const newStatus = [...gameState.current.checkpointsPassed];
      optimizedCheckpoints.forEach((checkpoint, index) => {
        // Check if car is within range of checkpoint
        // Make sure checkpoint has a position property before using it
        const checkpointPosition = checkpoint.position || checkpoint;
        const distance = calculateDistance(carPosition, checkpointPosition);

        if (distance < checkpointRadius && !newStatus[index]) {
          // Checkpoint passed!
          newStatus[index] = true;

          // Create a flash effect on screen
          const flash = document.createElement("div");
          flash.className = "checkpoint-flash";
          flash.style.position = "absolute";
          flash.style.inset = "0";
          flash.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
          flash.style.zIndex = "1000";
          flash.style.pointerEvents = "none";
          flash.style.animation = "flash 0.5s ease-out";
          document.body.appendChild(flash);

          // Remove flash after animation
          setTimeout(() => {
            document.body.removeChild(flash);
          }, 500);
        }

        if (!newStatus[index]) allPassed = false;
      });

      gameState.current.checkpointsPassed = newStatus;
      setCheckpointStatus(newStatus);

      // Only check finish line if all checkpoints have been passed
      if (allPassed && !gameState.current.raceComplete) {
        const finishDistance = calculateDistance(carPosition, finishPos);

        if (finishDistance < checkpointRadius) {
          // Race complete!
          gameState.current.raceComplete = true;
          gameState.current.raceFinishTime = performance.now();
          const totalTime =
            (gameState.current.raceFinishTime -
              gameState.current.raceStartTime) /
            1000;
          setRaceTime(totalTime);
          setRaceComplete(true);

          // Create a finish flash effect
          const flash = document.createElement("div");
          flash.className = "finish-flash";
          flash.style.position = "absolute";
          flash.style.inset = "0";
          flash.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
          flash.style.zIndex = "1000";
          flash.style.pointerEvents = "none";
          flash.style.animation = "flash 1s ease-out";
          document.body.appendChild(flash);

          // Remove flash after animation
          setTimeout(() => {
            document.body.removeChild(flash);
          }, 1000);
        }
      }
    } else if (checkpoints && checkpoints.length > 0) {
      // Fallback to original checkpoints if optimizedCheckpoints not ready
      let allPassed = true;

      const newStatus = [
        ...(gameState.current.checkpointsPassed ||
          Array(checkpoints.length).fill(false)),
      ];
      checkpoints.forEach((checkpoint, index) => {
        // Check if car is within range of checkpoint
        const distance = calculateDistance(carPosition, checkpoint);

        if (distance < checkpointRadius && !newStatus[index]) {
          // Checkpoint passed!
          newStatus[index] = true;

          // Create a flash effect on screen
          const flash = document.createElement("div");
          flash.className = "checkpoint-flash";
          flash.style.position = "absolute";
          flash.style.inset = "0";
          flash.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
          flash.style.zIndex = "1000";
          flash.style.pointerEvents = "none";
          flash.style.animation = "flash 0.5s ease-out";
          document.body.appendChild(flash);

          // Remove flash after animation
          setTimeout(() => {
            document.body.removeChild(flash);
          }, 500);
        }

        if (!newStatus[index]) allPassed = false;
      });

      gameState.current.checkpointsPassed = newStatus;
      setCheckpointStatus(newStatus);

      // Check finish line only if all checkpoints passed
      if (allPassed && !gameState.current.raceComplete) {
        const finishDistance = calculateDistance(carPosition, finishPos);
        if (finishDistance < checkpointRadius) {
          // Race complete!
          gameState.current.raceComplete = true;
          gameState.current.raceFinishTime = performance.now();
          const totalTime =
            (gameState.current.raceFinishTime -
              gameState.current.raceStartTime) /
            1000;
          setRaceTime(totalTime);
          setRaceComplete(true);

          // Create a finish flash effect
          const flash = document.createElement("div");
          flash.className = "finish-flash";
          flash.style.position = "absolute";
          flash.style.inset = "0";
          flash.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
          flash.style.zIndex = "1000";
          flash.style.pointerEvents = "none";
          flash.style.animation = "flash 1s ease-out";
          document.body.appendChild(flash);

          // Remove flash after animation
          setTimeout(() => {
            document.body.removeChild(flash);
          }, 1000);
        }
      }
    } else {
      // No checkpoints, just check finish line
      const finishDistance = calculateDistance(carPosition, finishPos);

      if (
        finishDistance < checkpointRadius &&
        !gameState.current.raceComplete
      ) {
        // Race complete!
        gameState.current.raceComplete = true;
        gameState.current.raceFinishTime = performance.now();
        const totalTime =
          (gameState.current.raceFinishTime - gameState.current.raceStartTime) /
          1000;
        setRaceTime(totalTime);
        setRaceComplete(true);

        // Create a finish flash effect
        const flash = document.createElement("div");
        flash.className = "finish-flash";
        flash.style.position = "absolute";
        flash.style.inset = "0";
        flash.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
        flash.style.zIndex = "1000";
        flash.style.pointerEvents = "none";
        flash.style.animation = "flash 1s ease-out";
        document.body.appendChild(flash);

        // Remove flash after animation
        setTimeout(() => {
          document.body.removeChild(flash);
        }, 1000);
      }
    }
  };

  // Function to check if car is on the route
  const isCarOnRoute = (carPosition, routeCoords) => {
    if (!routeCoords || routeCoords.length < 2) return true;

    // For direct line segments, we need to find the closest line segment
    let minDistance = Infinity;

    // Check each segment of the route
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const start = routeCoords[i];
      const end = routeCoords[i + 1];

      // Calculate the distance from the car to this line segment
      const distance = distanceToLineSegment(
        carPosition[0],
        carPosition[1],
        start[0],
        start[1],
        end[0],
        end[1]
      );

      minDistance = Math.min(minDistance, distance);
    }

    // Define max allowed distance from route (adjust as needed)
    // This is the width of the invisible wall corridor
    const maxDistanceFromRoute = 0.0003; // ~30-40 meters depending on latitude - much wider corridor

    return minDistance <= maxDistanceFromRoute;
  };

  // Helper function to calculate distance from a point to a line segment
  const distanceToLineSegment = (px, py, x1, y1, x2, y2) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;

    return Math.sqrt(dx * dx + dy * dy);
  };

  useEffect(() => {
    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: gameState.current.carPosition,
      zoom: 21,
      pitch: 55,
      bearing: (gameState.current.carHeading * 180) / Math.PI, // Use car's heading in degrees
      antialias: true,
      config: {
        basemap: {
          lightPreset: "dusk",
          showPointOfInterestLabels: true,
          showPlaceLabels: true,
        },
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      // Add DEM source
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.0 });

      // (Optional) 3D buildings if the style has a "composite" source
      if (map.getSource("composite")) {
        map.addLayer({
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", ["get", "extrude"], "true"],
          type: "fill-extrusion",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#aaa",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 1,
          },
        });
      }

      //   map.setRain({
      //     density: 0.5,
      //     intensity: 1.0,
      //     color: "#a8adbc",
      //     opacity: 0.7,
      //     vignette: 1,
      //     "vignette-color": "#464646",
      //     direction: [0, 80],
      //     "droplet-size": [2.6, 18.2],
      //     "distortion-strength": 0.7,
      //     "center-thinning": 0, // Rain to be displayed on the whole screen area
      //   });

      // Fetch and display the race route
      fetchAndDisplayRoute(map);

      // Add custom layer for car
      map.addLayer({
        id: "car-layer",
        type: "custom",
        renderingMode: "3d",

        onAdd: function (map, gl) {
          this.camera = new THREE.Camera();
          this.scene = new THREE.Scene();

          // Lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
          this.scene.add(ambientLight);

          const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
          dirLight1.position.set(0, -5, 5).normalize();
          this.scene.add(dirLight1);

          const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
          dirLight2.position.set(0, 5, 5).normalize();
          this.scene.add(dirLight2);

          // Load primary car model
          const loader = new GLTFLoader();
          loader.load(
            "./models/low_poly_nissan_gtr.glb",
            (gltf) => {
              this.carModel = gltf.scene;
              this.carModel.scale.set(1, 1, 1);

              // Center the model
              const box = new THREE.Box3().setFromObject(this.carModel);
              const center = box.getCenter(new THREE.Vector3());
              this.carModel.position.sub(center);

              // Raise it slightly
              this.carModel.position.y += 2;

              this.scene.add(this.carModel);
              gameState.current.modelLoaded = true;
              setModelLoaded(true);
            },
            undefined,
            (error) => {
              console.error("Error loading car model:", error);
            }
          );

          // Load second car model
          loader.load(
            "./models/low_poly_nissan_gtr.glb", // Using the same model, could be different
            (gltf) => {
              this.secondCarModel = gltf.scene.clone();
              this.secondCarModel.scale.set(1, 1, 1);

              // Center the model
              const box = new THREE.Box3().setFromObject(this.secondCarModel);
              const center = box.getCenter(new THREE.Vector3());
              this.secondCarModel.position.sub(center);

              // Raise it slightly
              this.secondCarModel.position.y += 2;

              // Make the second car a different color
              this.secondCarModel.traverse((child) => {
                if (child.isMesh && child.material) {
                  if (Array.isArray(child.material)) {
                    child.material = child.material.map((mat) => {
                      const newMat = mat.clone();
                      newMat.color.set(0x3366ff); // Blue color
                      return newMat;
                    });
                  } else {
                    const newMat = child.material.clone();
                    newMat.color.set(0x3366ff); // Blue color
                    child.material = newMat;
                  }
                }
              });

              this.scene.add(this.secondCarModel);
              gameState.current.secondCarModelLoaded = true;
              setSecondCarModelLoaded(true);
            },
            undefined,
            (error) => {
              console.error("Error loading second car model:", error);
            }
          );

          // Renderer
          this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
          });
          this.renderer.autoClear = false;
        },

        render: function (gl, matrix) {
          // Skip rendering if primary car model isn't loaded
          if (!this.carModel) return;

          const {
            carPosition,
            carHeading,
            secondCarPosition,
            secondCarHeading,
          } = gameState.current;

          // Primary car elevation
          const elevation = map.queryTerrainElevation(carPosition) || 0;

          // ====== TERRAIN TILT LOGIC - PRIMARY CAR ======
          // We'll sample 4 points: front, back, left, right
          // relative to the car's heading, to approximate the slope.

          // Small offset in degrees for sampling
          const sampleDistDeg = 0.00003; // about ~3m, depending on latitude
          // Convert heading to sin/cos
          const sinH = Math.sin(carHeading);
          const cosH = Math.cos(carHeading);

          // Forward/Back coords
          const frontCoord = [
            carPosition[0] + sampleDistDeg * sinH,
            carPosition[1] + sampleDistDeg * cosH,
          ];
          const backCoord = [
            carPosition[0] - sampleDistDeg * sinH,
            carPosition[1] - sampleDistDeg * cosH,
          ];

          // Right/Left coords (heading + 90° => heading + π/2)
          const rightCoord = [
            carPosition[0] + sampleDistDeg * cosH,
            carPosition[1] - sampleDistDeg * sinH,
          ];
          const leftCoord = [
            carPosition[0] - sampleDistDeg * cosH,
            carPosition[1] + sampleDistDeg * sinH,
          ];

          const elevFront = map.queryTerrainElevation(frontCoord) || 0;
          const elevBack = map.queryTerrainElevation(backCoord) || 0;
          const elevLeft = map.queryTerrainElevation(leftCoord) || 0;
          const elevRight = map.queryTerrainElevation(rightCoord) || 0;

          // Convert sampling distance from degrees to meters (approx)
          const degToMeter = 111000; // rough conversion near equator
          // We used sampleDistDeg in both directions, so the total distance front->back is 2 * sampleDistDeg
          // We'll just assume the slope is (height difference / (distance in meters)).
          const distMeters = sampleDistDeg * degToMeter;

          // Pitch ~ difference front/back
          // Positive pitch => nose up
          const pitchSlope = (elevFront - elevBack) / (2 * distMeters);
          // pitch angle in radians
          const pitchAngle = Math.atan(pitchSlope);

          // Roll ~ difference left/right
          // Positive roll => car tilts right side up
          const rollSlope = (elevRight - elevLeft) / (2 * distMeters);
          const rollAngle = Math.atan(rollSlope);

          // ====== BUILD PRIMARY CAR MODEL MATRIX ======
          // 1) Translate to (x, y, z) in Mercator
          // 2) Scale
          // 3) Rotate so car points the correct heading
          // 4) Tilt for pitch & roll
          // 5) Adjust model orientation (rotate X by π/2 to put wheels on ground)

          // Position the car just slightly in front so you see it
          const offsetDistance = 0.00008;
          const offsetLng = carPosition[0] + offsetDistance * sinH;
          const offsetLat = carPosition[1] + offsetDistance * cosH;

          const merc = mapboxgl.MercatorCoordinate.fromLngLat(
            [offsetLng, offsetLat],
            elevation
          );
          const modelScale = merc.meterInMercatorCoordinateUnits();

          const translateMatrix = new THREE.Matrix4().makeTranslation(
            merc.x,
            merc.y,
            merc.z
          );
          const scaleMatrix = new THREE.Matrix4().makeScale(
            modelScale,
            modelScale,
            modelScale
          );

          // Car's "base" orientation is Z up in the GLB,
          // but we rotate it by X+90° so that car's Y is up in world space
          // (as done originally). We'll do that either first or last in the chain.
          // We'll apply pitch & roll after the heading.

          const rotationXupright = new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2
          );
          // Heading around Z
          const headingMatrix = new THREE.Matrix4().makeRotationZ(carHeading);

          // For pitch & roll, we typically rotate around the local X or local Y.
          // But since we do an X+90 early, we need to be careful about the order.
          // Let's do pitch around the local X axis, then roll around local Y,
          // *after* heading.
          const pitchMatrix = new THREE.Matrix4().makeRotationX(pitchAngle);
          const rollMatrix = new THREE.Matrix4().makeRotationY(rollAngle);

          // A suggested order is:
          // translate -> scale -> heading -> pitch -> roll -> uprightFix
          // You can experiment with the order if the sign of pitch or roll is flipped.
          let modelMatrix = new THREE.Matrix4();
          modelMatrix
            .multiply(translateMatrix)
            .multiply(scaleMatrix)
            .multiply(headingMatrix)
            .multiply(pitchMatrix)
            .multiply(rollMatrix)
            .multiply(rotationXupright);

          // Finally, multiply by the map's projection matrix
          const projectionMatrix = new THREE.Matrix4().fromArray(matrix);
          this.camera.projectionMatrix = projectionMatrix.multiply(modelMatrix);

          // Render the primary car
          this.renderer.resetState();
          this.renderer.render(this.scene, this.camera);

          // ====== SECOND CAR RENDERING ======
          // Only render if the second car model is loaded
          if (this.secondCarModel) {
            // Get second car elevation
            const secondCarElevation =
              map.queryTerrainElevation(secondCarPosition) || 0;

            // Calculate terrain tilt for second car (same process as for primary car)
            const sinH2 = Math.sin(secondCarHeading);
            const cosH2 = Math.cos(secondCarHeading);

            // Forward/Back coords for second car
            const frontCoord2 = [
              secondCarPosition[0] + sampleDistDeg * sinH2,
              secondCarPosition[1] + sampleDistDeg * cosH2,
            ];
            const backCoord2 = [
              secondCarPosition[0] - sampleDistDeg * sinH2,
              secondCarPosition[1] - sampleDistDeg * cosH2,
            ];

            // Right/Left coords for second car
            const rightCoord2 = [
              secondCarPosition[0] + sampleDistDeg * cosH2,
              secondCarPosition[1] - sampleDistDeg * sinH2,
            ];
            const leftCoord2 = [
              secondCarPosition[0] - sampleDistDeg * cosH2,
              secondCarPosition[1] + sampleDistDeg * sinH2,
            ];

            // Sample elevation at points around second car
            const elevFront2 = map.queryTerrainElevation(frontCoord2) || 0;
            const elevBack2 = map.queryTerrainElevation(backCoord2) || 0;
            const elevLeft2 = map.queryTerrainElevation(leftCoord2) || 0;
            const elevRight2 = map.queryTerrainElevation(rightCoord2) || 0;

            // Calculate pitch and roll for second car
            const pitchSlope2 = (elevFront2 - elevBack2) / (2 * distMeters);
            const pitchAngle2 = Math.atan(pitchSlope2);

            const rollSlope2 = (elevRight2 - elevLeft2) / (2 * distMeters);
            const rollAngle2 = Math.atan(rollSlope2);

            // Build the model matrix for the second car
            const merc2 = mapboxgl.MercatorCoordinate.fromLngLat(
              secondCarPosition,
              secondCarElevation
            );

            const translateMatrix2 = new THREE.Matrix4().makeTranslation(
              merc2.x,
              merc2.y,
              merc2.z
            );

            const headingMatrix2 = new THREE.Matrix4().makeRotationZ(
              secondCarHeading
            );
            const pitchMatrix2 = new THREE.Matrix4().makeRotationX(pitchAngle2);
            const rollMatrix2 = new THREE.Matrix4().makeRotationY(rollAngle2);

            let modelMatrix2 = new THREE.Matrix4();
            modelMatrix2
              .multiply(translateMatrix2)
              .multiply(scaleMatrix) // Reuse the scale from primary car
              .multiply(headingMatrix2)
              .multiply(pitchMatrix2)
              .multiply(rollMatrix2)
              .multiply(rotationXupright);

            // Update the second car's position
            this.secondCarModel.position.copy(this.carModel.position.clone());
            this.secondCarModel.rotation.copy(this.carModel.rotation.clone());

            // Apply the second car's model matrix to the camera
            const projectionMatrix2 = new THREE.Matrix4().fromArray(matrix);
            this.camera.projectionMatrix =
              projectionMatrix2.multiply(modelMatrix2);

            // Render the second car
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
          }

          map.triggerRepaint();
        },
      });

      setIsMapLoaded(true);
    });

    return () => map.remove();
  }, [initialPosition, defaultFinishPosition, checkpoints]);

  // Keyboard input
  useEffect(() => {
    if (!raceStarted) return;

    const keyMap = {
      ArrowUp: "forward",
      ArrowDown: "backward",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "forward",
      s: "backward",
      a: "left",
      d: "right",
      W: "forward",
      S: "backward",
      A: "left",
      D: "right",
    };

    const handleKeyDown = (e) => {
      const control = keyMap[e.key];
      if (control) {
        e.preventDefault();
        gameState.current.controls[control] = true;
        setDebugInfo((prev) => {
          const newActiveKeys = [...prev.activeKeys];
          if (!newActiveKeys.includes(e.key)) newActiveKeys.push(e.key);
          return { ...prev, activeKeys: newActiveKeys };
        });
      }
    };

    const handleKeyUp = (e) => {
      const control = keyMap[e.key];
      if (control) {
        e.preventDefault();
        gameState.current.controls[control] = false;
        setDebugInfo((prev) => {
          const newActiveKeys = prev.activeKeys.filter((k) => k !== e.key);
          return { ...prev, activeKeys: newActiveKeys };
        });
      }
    };

    // Clean up any existing keyboard listeners first
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);

    // Add the new listeners
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [raceStarted]);

  // Game loop (movement, etc.)
  useEffect(() => {
    if (!isMapLoaded || !raceStarted) return;

    // Start the race timer
    if (gameState.current.raceStartTime === 0) {
      gameState.current.raceStartTime = performance.now();
    }

    let animationId;

    const gameLoop = (timestamp) => {
      const state = gameState.current;

      const deltaTime = state.lastFrame ? timestamp - state.lastFrame : 16.67;
      state.lastFrame = timestamp;
      const dt = Math.min(deltaTime, 100) / 1000;

      // Key hold durations
      if (state.controls.forward) state.keyHoldDuration.forward += dt;
      else state.keyHoldDuration.forward = 0;

      if (state.controls.backward) state.keyHoldDuration.backward += dt;
      else state.keyHoldDuration.backward = 0;

      // Forward impulse
      if (state.controls.forward) {
        if (!state.prevControls.forward) {
          state.forwardImpulse = 0.1;
        } else if (state.keyHoldDuration.forward > 0.1) {
          state.forwardImpulse = Math.min(1.0, state.forwardImpulse + dt * 1.5);
        }
      } else {
        state.forwardImpulse *= 0.7;
      }

      // Backward impulse
      if (state.controls.backward) {
        if (!state.prevControls.backward) {
          state.backwardImpulse = 0.3;
        } else if (state.keyHoldDuration.backward > 0.1) {
          state.backwardImpulse = Math.min(
            1.0,
            state.backwardImpulse + dt * 1.5
          );
        }
      } else {
        state.backwardImpulse *= 0.7;
      }

      if (state.forwardImpulse < 0.01) state.forwardImpulse = 0;
      if (state.backwardImpulse < 0.01) state.backwardImpulse = 0;

      // Make a copy of the controls to compare in next frame
      state.prevControls = { ...state.controls };

      // Steering
      const maxSteeringAngle = 1.2; // ~69 degrees
      const steeringSpeed = 3.0 * dt;
      const returnSpeed = 2.0 * dt;

      if (state.controls.left) {
        state.steeringAngle = Math.max(
          state.steeringAngle - steeringSpeed,
          -maxSteeringAngle
        );
      } else if (state.controls.right) {
        state.steeringAngle = Math.min(
          state.steeringAngle + steeringSpeed,
          maxSteeringAngle
        );
      } else {
        if (state.steeringAngle > 0) {
          state.steeringAngle = Math.max(0, state.steeringAngle - returnSpeed);
        } else if (state.steeringAngle < 0) {
          state.steeringAngle = Math.min(0, state.steeringAngle + returnSpeed);
        }
      }

      // Physics
      const mapUnitToMeter = 111000;
      const meterToMapUnit = 1 / mapUnitToMeter;
      const speedMS = state.carSpeed * mapUnitToMeter;

      let tractionForce = 0;
      if (state.forwardImpulse > 0) {
        const maxForce = (state.enginePower * 746) / Math.max(1, speedMS * 3.6);
        tractionForce = maxForce * state.forwardImpulse;
      }

      let brakeForce = 0;
      if (state.backwardImpulse > 0) {
        if (speedMS > 0.2) {
          brakeForce = state.brakingForce * state.backwardImpulse;
        } else if (speedMS > -0.5) {
          // Reverse
          tractionForce = -state.enginePower * 200 * state.backwardImpulse;
        }
      }

      const dragForce =
        state.dragCoefficient * speedMS * speedMS * Math.sign(speedMS);
      const rollingForce =
        state.rollingResistance * speedMS * Math.sign(speedMS);
      const naturalBrakingForce =
        state.frictionCoefficient * 12 * Math.sign(speedMS);

      const inputActive = state.forwardImpulse > 0 || state.backwardImpulse > 0;
      const decelMultiplier = inputActive ? 1.0 : 2.5;
      const decelForce =
        (dragForce + rollingForce + naturalBrakingForce) * decelMultiplier;

      const totalForce = tractionForce - brakeForce - decelForce;
      const accel = totalForce / state.mass;

      let newSpeedMS = speedMS + accel * dt;
      if (Math.abs(newSpeedMS) < 0.3) {
        newSpeedMS = 0;
      }

      state.carSpeed = newSpeedMS * meterToMapUnit;
      if (state.carSpeed > state.maxSpeed) {
        state.carSpeed = state.maxSpeed;
      } else if (state.carSpeed < -state.maxSpeed / 2) {
        state.carSpeed = -state.maxSpeed / 2;
      }

      // Turning
      if (
        Math.abs(state.carSpeed) > 1e-9 &&
        Math.abs(state.steeringAngle) > 1e-5
      ) {
        const turnRadius =
          state.wheelbase / Math.sin(Math.abs(state.steeringAngle));
        const angularVelocity = (state.carSpeed * mapUnitToMeter) / turnRadius;
        state.carHeading +=
          angularVelocity *
          dt *
          Math.sign(state.steeringAngle) *
          Math.sign(state.carSpeed);

        state.carHeading %= 2 * Math.PI;
        if (state.carHeading < 0) state.carHeading += 2 * Math.PI;
      }

      // Update position
      if (Math.abs(state.carSpeed) > 1e-9) {
        const vx = state.carSpeed * Math.sin(state.carHeading);
        const vy = state.carSpeed * Math.cos(state.carHeading);

        const inertiaFactor = 0.85;
        if (!state.carVelocity[0] && !state.carVelocity[1]) {
          state.carVelocity = [vx, vy];
        } else {
          state.carVelocity = [
            vx * (1 - inertiaFactor) + state.carVelocity[0] * inertiaFactor,
            vy * (1 - inertiaFactor) + state.carVelocity[1] * inertiaFactor,
          ];
        }

        const tentativeNewPos = [
          state.carPosition[0] + state.carVelocity[0],
          state.carPosition[1] + state.carVelocity[1],
        ];

        // Re-enable the wall check with our improved distance calculation
        if (
          routeCoordinates &&
          routeCoordinates.length > 0 &&
          !isCarOnRoute(tentativeNewPos, routeCoordinates)
        ) {
          // Car is trying to go off-route - prevent it
          // Reduce speed significantly
          state.carSpeed *= 0.2;

          // Show warning if not already showing
          if (!offTrackWarning) {
            setOffTrackWarning(true);
            setTimeout(() => setOffTrackWarning(false), 1000);
          }

          // Keep car at current position with minimal movement
          // This creates a "sliding along wall" effect
          const bounceBackFactor = 0.02;
          state.carPosition = [
            state.carPosition[0] + state.carVelocity[0] * bounceBackFactor,
            state.carPosition[1] + state.carVelocity[1] * bounceBackFactor,
          ];
        } else {
          // Car is on route or no route loaded yet, proceed with normal movement
          state.carPosition = tentativeNewPos;
        }
      }

      // ===== SECOND CAR AI LOGIC =====
      // Calculate the vector from second car to primary car
      const dx = state.carPosition[0] - state.secondCarPosition[0];
      const dy = state.carPosition[1] - state.secondCarPosition[1];

      // Distance between cars
      const distanceBetweenCars = Math.sqrt(dx * dx + dy * dy);

      // Target direction toward primary car
      const targetHeading = Math.atan2(dx, dy);

      // Gradually adjust second car heading toward target
      const headingDiff =
        ((targetHeading - state.secondCarHeading + Math.PI * 3) %
          (Math.PI * 2)) -
        Math.PI;
      state.secondCarHeading += headingDiff * 2.5 * dt; // Steering factor, higher = more responsive

      // Normalize heading
      state.secondCarHeading %= 2 * Math.PI;
      if (state.secondCarHeading < 0) state.secondCarHeading += 2 * Math.PI;

      // Calculate target speed based on distance to primary car
      let targetSpeed;

      // If too close, slow down or back up
      const minDistance = state.secondCarDistance * 0.7;
      const idealDistance = state.secondCarDistance;
      const maxDistance = state.secondCarDistance * 1.5;

      if (distanceBetweenCars < minDistance) {
        // Too close, back up slightly
        targetSpeed = -state.maxSpeed * 0.3;
      } else if (distanceBetweenCars > maxDistance) {
        // Too far, speed up to catch up
        targetSpeed = state.maxSpeed * 1.1; // Slightly faster to catch up
      } else if (distanceBetweenCars > idealDistance) {
        // Slightly too far, adjust speed proportionally
        const speedFactor = Math.min(
          1.0,
          (distanceBetweenCars - idealDistance) / (maxDistance - idealDistance)
        );
        targetSpeed = state.carSpeed * (1 + speedFactor * 0.2);
      } else {
        // Within acceptable range, match primary car's speed
        targetSpeed = state.carSpeed * 0.95; // Slightly slower to maintain distance
      }

      // Gradually adjust second car speed
      state.secondCarSpeed =
        state.secondCarSpeed + (targetSpeed - state.secondCarSpeed) * 2 * dt;

      // Ensure speed is within limits
      if (state.secondCarSpeed > state.maxSpeed * 1.1) {
        state.secondCarSpeed = state.maxSpeed * 1.1;
      } else if (state.secondCarSpeed < -state.maxSpeed / 2) {
        state.secondCarSpeed = -state.maxSpeed / 2;
      }

      // Update second car position
      if (Math.abs(state.secondCarSpeed) > 1e-9) {
        const vx2 = state.secondCarSpeed * Math.sin(state.secondCarHeading);
        const vy2 = state.secondCarSpeed * Math.cos(state.secondCarHeading);

        state.secondCarVelocity = [vx2, vy2];

        const tentativeNewPos2 = [
          state.secondCarPosition[0] + state.secondCarVelocity[0],
          state.secondCarPosition[1] + state.secondCarVelocity[1],
        ];

        // Check if second car would go off route
        if (
          routeCoordinates &&
          routeCoordinates.length > 0 &&
          !isCarOnRoute(tentativeNewPos2, routeCoordinates)
        ) {
          // Second car is trying to go off-route - reduce speed
          state.secondCarSpeed *= 0.2;

          // Minimal movement with bounce-back effect
          const bounceBackFactor = 0.02;
          state.secondCarPosition = [
            state.secondCarPosition[0] +
              state.secondCarVelocity[0] * bounceBackFactor,
            state.secondCarPosition[1] +
              state.secondCarVelocity[1] * bounceBackFactor,
          ];
        } else {
          // Second car is on route, proceed with normal movement
          state.secondCarPosition = tentativeNewPos2;
        }
      }

      // Move camera with the car
      if (mapRef.current) {
        const headingDeg = ((state.carHeading * 180) / Math.PI) % 360;
        mapRef.current.jumpTo({
          center: state.carPosition,
          bearing: headingDeg,
          pitch: 75,
        });
        mapRef.current.triggerRepaint();
      }

      // Debug info ~5 times/sec
      if (timestamp % 200 < 16) {
        setDebugInfo((prev) => ({
          ...prev,
          position: [...state.carPosition],
          heading: state.carHeading,
          speed: state.carSpeed,
        }));
      }

      // Update race time if race is ongoing
      if (!state.raceComplete) {
        const currentRaceTime =
          (performance.now() - state.raceStartTime) / 1000;
        if (timestamp % 100 < 16) {
          // Update UI ~10 times/sec
          setRaceTime(currentRaceTime);
        }
      }

      // Check race progress
      checkRaceProgress();

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [isMapLoaded, raceStarted, routeCoordinates, offTrackWarning]);

  return (
    <div className="w-full h-full relative">
      {/* Add animation style to head */}
      <style>{flashAnimationStyle}</style>

      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isMapLoaded && !modelLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
          <div className="w-16 h-16 border-t-4 border-blue-500 rounded-full animate-spin mb-4"></div>
          <div className="text-white text-xl">Loading race car...</div>
        </div>
      )}

      {/* Countdown overlay */}
      {modelLoaded && countdown > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-60">
          <div className="text-white text-2xl mb-4">Race starting in</div>
          <div className="text-white text-8xl font-bold animate-bounce">
            {countdown}
          </div>
          <div className="mt-8 text-gray-300 text-lg">Get ready!</div>
        </div>
      )}

      {/* Race timer UI */}
      {raceStarted && !raceComplete && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white p-3 rounded-lg">
          <div className="text-xl font-bold">{raceTime.toFixed(2)}s</div>

          {/* Route distance */}
          {debugInfo.routeDistance && (
            <div className="text-xs text-gray-300 mt-1">
              Race distance: {(debugInfo.routeDistance / 1000).toFixed(2)} km
            </div>
          )}

          {/* Checkpoint progress indicator */}
          {checkpoints && checkpoints.length > 0 && (
            <div className="mt-2">
              <div className="text-xs mb-1">Checkpoints:</div>
              <div className="flex gap-2">
                {checkpointStatus.map((passed, index) => (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full ${
                      passed ? "bg-green-500" : "bg-gray-500"
                    }`}
                    title={`Checkpoint ${index + 1}`}
                  ></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Next checkpoint guidance */}
      {raceStarted &&
        !raceComplete &&
        optimizedCheckpoints &&
        optimizedCheckpoints.length > 0 && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
            {checkpointStatus.every((status) => status) ? (
              <div className="text-center">
                <div className="text-sm text-yellow-400 font-medium">
                  FINAL TARGET
                </div>
                <div className="text-xs">Head to the finish line!</div>
              </div>
            ) : (
              <div className="text-center">
                {checkpointStatus.findIndex((status) => !status) !== -1 && (
                  <>
                    <div className="text-sm text-yellow-400 font-medium">
                      CHECKPOINT{" "}
                      {checkpointStatus.findIndex((status) => !status) + 1}
                    </div>
                    <div className="text-xs">Follow the blue line</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

      {/* Race complete overlay */}
      {raceComplete && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-60">
          <div className="bg-black bg-opacity-80 p-8 rounded-xl flex flex-col items-center">
            <div className="text-green-500 text-4xl mb-4 font-bold">
              FINISH!
            </div>
            <div className="text-white text-6xl font-bold mb-6">
              {raceTime.toFixed(2)}s
            </div>
            <button
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition"
              onClick={resetRace}
            >
              Race Again
            </button>
          </div>
        </div>
      )}

      {/* Off-track warning */}
      {offTrackWarning && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                      bg-red-600 bg-opacity-60 text-white px-6 py-3 rounded-lg text-xl font-bold"
        >
          Stay on the track!
        </div>
      )}

      {/* Controls help overlay */}
      {raceStarted && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white p-3 rounded-lg">
          <div className="text-sm mb-1 font-medium">Controls:</div>
          <div className="grid grid-cols-2 gap-x-4 text-xs">
            <div>W / ↑: Accelerate</div>
            <div>S / ↓: Brake/Reverse</div>
            <div>A / ←: Turn Left</div>
            <div>D / →: Turn Right</div>
          </div>
        </div>
      )}
    </div>
  );
}
