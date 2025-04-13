import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import CarPhysics from "../car/physics";
import multiplayerConnection from "../utils/websocket";
import { getUserData } from "../utils/auth";
import MultiplayerVehicle from "./MultiplayerVehicle";

import useSound from "use-sound";

import startSound from "../assets/start_sound.mp3";

// Access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

// Define keyframe animations
const flashAnimationStyle = `
@keyframes flash {
  0% { opacity: 0.7; }
  100% { opacity: 0; }
}

@keyframes rotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

@keyframes scanline {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}

@keyframes dashOffset {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -30; }
}
`;

export default function RaceView({
  startPosition,
  finishPosition,
  checkpoints = [],
  timeOfDay = "day",
  weather = "clear",
  partyId = null,
}) {
  // Remove debug logs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [raceStarted, setRaceStarted] = useState(false);
  const [_routeLoaded, setRouteLoaded] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [offTrackWarning, setOffTrackWarning] = useState(false);
  const [warningZoneAlert, setWarningZoneAlert] = useState(false);
  const [optimizedCheckpoints, setOptimizedCheckpoints] = useState([]);
  // Add FPS state
  const [fps, setFps] = useState(0);
  // Store the frame times for averaging (past 20 frames)
  const frameTimesRef = useRef([]);
  const [checkpointStatus, setCheckpointStatus] = useState([]);
  const [raceComplete, setRaceComplete] = useState(false);
  const [raceTime, setRaceTime] = useState(0);
  const [compassDirection, setCompassDirection] = useState(0);
  const [nextTargetName, setNextTargetName] = useState("");
  const [distanceToNextTarget, setDistanceToNextTarget] = useState(0);

  // Add multiplayer state
  const [otherPlayers, setOtherPlayers] = useState(new Map());
  const [userData] = useState(getUserData());
  const multiplayerVehiclesRef = useRef(new Map());

  const [playStartSound] = useSound(startSound, { playbackRate: 1.1 });

  // Format checkpoints to ensure they're in [longitude, latitude] format
  const formattedCheckpoints = useMemo(() => {
    if (!checkpoints || checkpoints.length === 0) {
      return [];
    }

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
  }, [checkpoints]);

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

  // Get light preset based on time of day
  const lightPreset = useMemo(() => {
    const presets = {
      dawn: "dawn",
      day: "day",
      dusk: "dusk",
      night: "night",
    };
    return presets[timeOfDay] || "day";
  }, [timeOfDay]);

  // Create CarPhysics instance
  const carPhysics = useRef(new CarPhysics(initialPosition));

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

  // Initialize checkpoint status and finish position
  useEffect(() => {
    // Ensure we're using consistent finish position
    carPhysics.current.actualFinishPosition = actualFinishPosition;

    // Calculate initial heading toward first checkpoint or finish
    let initialHeading = 0;
    if (formattedCheckpoints && formattedCheckpoints.length > 0) {
      // Head toward first checkpoint
      const dx = formattedCheckpoints[0][0] - initialPosition[0];
      const dy = formattedCheckpoints[0][1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    } else if (actualFinishPosition) {
      // Head toward finish position
      const dx = actualFinishPosition[0] - initialPosition[0];
      const dy = actualFinishPosition[1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    }

    // Set initial car heading
    carPhysics.current.carHeading = initialHeading;

    // Run updateCompassDirection once to initialize compass values
    setTimeout(() => {
      updateCompassDirection();
    }, 100);

    // Apply initial bearing to map if map is ready
    if (mapRef.current) {
      mapRef.current.jumpTo({
        bearing: (initialHeading * 180) / Math.PI,
      });
    }

    if (formattedCheckpoints && formattedCheckpoints.length > 0) {
      // Create orderedCheckpoints array with properly formatted data
      const orderedCheckpoints = formattedCheckpoints.map(
        (checkpoint, index) => ({
          position: checkpoint,
          originalIndex: index,
        })
      );
      setOptimizedCheckpoints(orderedCheckpoints);

      const initialStatus = orderedCheckpoints.map(() => false);
      setCheckpointStatus(initialStatus);
      carPhysics.current.checkpointsPassed = initialStatus;
    }
  }, [
    formattedCheckpoints,
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

    // Reset checkpoint status
    const resetStatus = Array(checkpointStatus.length).fill(false);
    setCheckpointStatus(resetStatus);

    // Calculate initial heading toward first checkpoint or finish
    let initialHeading = 0;
    if (formattedCheckpoints && formattedCheckpoints.length > 0) {
      // Head toward first checkpoint
      const dx = formattedCheckpoints[0][0] - initialPosition[0];
      const dy = formattedCheckpoints[0][1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    } else if (actualFinishPosition) {
      // Head toward finish position
      const dx = actualFinishPosition[0] - initialPosition[0];
      const dy = actualFinishPosition[1] - initialPosition[1];
      initialHeading = Math.atan2(dx, dy);
    }

    // Reset physics using the CarPhysics class
    carPhysics.current.reset(initialPosition, initialHeading, resetStatus);
    carPhysics.current.modelLoaded = false;

    // Reset compass direction to initial value
    setTimeout(() => {
      updateCompassDirection();
    }, 100);

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
      carPhysics.current.modelLoaded = true;
    }, 100);
  };

  // Start the countdown when both models are loaded
  useEffect(() => {
    if (isMapLoaded && modelLoaded) {
      playStartSound();
      // Create audio object outside interval
      const timer = setInterval(() => {
        // Play sound before updating countdown

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
  }, [isMapLoaded, modelLoaded]);

  // Load and display race route
  const fetchAndDisplayRoute = async (map) => {
    try {
      // Use our stored finish position for consistency
      const finishPointToUse = actualFinishPosition;

      // Build waypoints array with checkpoints in the middle
      const waypoints = [initialPosition];

      // Add all checkpoints in between in their original order
      if (formattedCheckpoints && formattedCheckpoints.length > 0) {
        waypoints.push(...formattedCheckpoints);
      }

      // Add finish position as the last point
      waypoints.push(finishPointToUse);

      // Also update the car physics
      carPhysics.current.actualFinishPosition = finishPointToUse;

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

      // Add the route source and layer
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: routeGeometry,
        },
      });

      // Add route line layer with improved visibility
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0080ff",
          "line-width": 8,
          "line-opacity": 0.8,
          "line-dasharray": [0.2, 0.2],
          "line-gap-width": 2,
          "line-emissive-strength": 0.5, // Makes the line glow
        },
      });

      // Add a secondary outline for better visibility in all lighting conditions
      map.addLayer(
        {
          id: "route-outline",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 12,
            "line-opacity": 0.4,
            "line-blur": 2,
          },
        },
        "route-line"
      ); // Add outline beneath the main line

      // Add animated line on top for extra visibility
      map.addLayer({
        id: "route-pulse",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color":
            lightPreset === "night"
              ? "#00ffff" // Brighter cyan for night
              : lightPreset === "dusk"
              ? "#00c8ff" // Bright blue for dusk
              : lightPreset === "dawn"
              ? "#40a0ff" // Medium blue for dawn
              : "#0080ff", // Default blue for day
          "line-width": 4,
          "line-opacity": 0.9,
          "line-dasharray": [0.1, 2],
          "line-emissive-strength": 0.8,
        },
      });

      // Adding "3D" ground markers along the route for better visibility
      // First, create point features along the route
      const groundMarkers = {
        type: "FeatureCollection",
        features: [],
      };

      // Place markers every ~40 meters along the route
      for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Use more markers for longer segments
        const steps = Math.max(3, Math.floor((dist * 111000) / 40)); // ~40m spacing

        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          groundMarkers.features.push({
            type: "Feature",
            properties: {
              index: i * 100 + j, // For animation offset
            },
            geometry: {
              type: "Point",
              coordinates: [start[0] + t * dx, start[1] + t * dy],
            },
          });
        }
      }

      // Add ground markers source
      map.addSource("route-markers", {
        type: "geojson",
        data: groundMarkers,
      });

      // Add circle markers with adaptive colors
      map.addLayer({
        id: "route-ground-markers",
        type: "circle",
        source: "route-markers",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16,
            1.5,
            22,
            5,
          ],
          "circle-color":
            lightPreset === "night"
              ? "#40c0ff"
              : weather === "rain"
              ? "#80c0ff"
              : weather === "snow"
              ? "#40a0ff"
              : "#0080ff",
          "circle-opacity": 0.7,
          "circle-emissive-strength": 0.5,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.4,
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

        // Create a custom arrow symbol rather than loading from external URL
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

        // Create our own arrow icon
        const arrowCanvas = document.createElement("canvas");
        arrowCanvas.width = 20;
        arrowCanvas.height = 20;
        const ctx = arrowCanvas.getContext("2d");

        // Draw a simple arrow
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(10, 0); // Top point
        ctx.lineTo(20, 20); // Bottom right
        ctx.lineTo(10, 15); // Indent bottom
        ctx.lineTo(0, 20); // Bottom left
        ctx.lineTo(10, 0); // Back to top
        ctx.fill();
        ctx.strokeStyle = "#0080ff";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Add the arrow image from canvas
        map.addImage("arrow", ctx.getImageData(0, 0, 20, 20));
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

  // Check for checkpoint and finish line crossings
  const checkRaceProgress = () => {
    const carPosition = carPhysics.current.carPosition;
    const checkpointRadius = 0.00015; // Detection radius for checkpoints, ~15m

    // Always use the finish position from car physics
    const finishPos = carPhysics.current.actualFinishPosition;

    // Check each checkpoint
    if (optimizedCheckpoints && optimizedCheckpoints.length > 0) {
      let allPassed = true;

      const newStatus = [...carPhysics.current.checkpointsPassed];
      optimizedCheckpoints.forEach((checkpoint, index) => {
        // Check if car is within range of checkpoint
        // Make sure checkpoint has a position property before using it
        const checkpointPosition = checkpoint.position || checkpoint;
        const distance = carPhysics.current.calculateDistance(
          carPosition,
          checkpointPosition
        );

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

      carPhysics.current.checkpointsPassed = newStatus;
      setCheckpointStatus(newStatus);

      // Only check finish line if all checkpoints have been passed
      if (allPassed && !carPhysics.current.raceComplete) {
        const finishDistance = carPhysics.current.calculateDistance(
          carPosition,
          finishPos
        );

        if (finishDistance < checkpointRadius) {
          // Race complete!
          const totalTime = carPhysics.current.completeRace();
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
    } else if (formattedCheckpoints && formattedCheckpoints.length > 0) {
      // Fallback to original checkpoints if optimizedCheckpoints not ready
      let allPassed = true;

      const newStatus = [
        ...(carPhysics.current.checkpointsPassed ||
          Array(formattedCheckpoints.length).fill(false)),
      ];
      formattedCheckpoints.forEach((checkpoint, index) => {
        // Check if car is within range of checkpoint
        const distance = carPhysics.current.calculateDistance(
          carPosition,
          checkpoint
        );

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

      carPhysics.current.checkpointsPassed = newStatus;
      setCheckpointStatus(newStatus);

      // Check finish line only if all checkpoints passed
      if (allPassed && !carPhysics.current.raceComplete) {
        const finishDistance = carPhysics.current.calculateDistance(
          carPosition,
          finishPos
        );
        if (finishDistance < checkpointRadius) {
          // Race complete!
          const totalTime = carPhysics.current.completeRace();
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
      const finishDistance = carPhysics.current.calculateDistance(
        carPosition,
        finishPos
      );

      if (
        finishDistance < checkpointRadius &&
        !carPhysics.current.raceComplete
      ) {
        // Race complete!
        const totalTime = carPhysics.current.completeRace();
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

  // Update compass direction
  const updateCompassDirection = () => {
    if (!carPhysics.current) return;

    const carPosition = carPhysics.current.carPosition;
    const carHeading = carPhysics.current.carHeading;
    let targetPosition;
    let targetName;

    // Find the next uncompleted checkpoint
    if (formattedCheckpoints && formattedCheckpoints.length > 0) {
      const nextCheckpointIndex =
        carPhysics.current.checkpointsPassed.findIndex((passed) => !passed);
      if (nextCheckpointIndex !== -1) {
        // We have a next checkpoint
        targetPosition = formattedCheckpoints[nextCheckpointIndex];
        targetName = `Checkpoint ${nextCheckpointIndex + 1}`;
      } else {
        // All checkpoints passed, target is finish line
        targetPosition = carPhysics.current.actualFinishPosition;
        targetName = "Finish";
      }
    } else {
      // No checkpoints, so target is finish line
      targetPosition = carPhysics.current.actualFinishPosition;
      targetName = "Finish";
    }

    if (targetPosition) {
      // Calculate direction to target
      const dx = targetPosition[0] - carPosition[0];
      const dy = targetPosition[1] - carPosition[1];

      // Angle from car to target (in radians)
      const targetAngle = Math.atan2(dx, dy);

      // Compass should point relative to car heading
      // Subtract car heading from target angle to get relative angle
      let relativeAngle = targetAngle - carHeading;

      // Normalize to -PI to PI range
      relativeAngle = ((relativeAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

      // Convert to degrees for display
      const compassAngle = (relativeAngle * 180) / Math.PI;

      // Force state update with fresh value
      setCompassDirection(compassAngle);
      setNextTargetName(targetName);

      // Calculate distance to target (approximate in meters)
      const distance = carPhysics.current.calculateDistance(
        carPosition,
        targetPosition
      );
      // Convert from degrees to meters (roughly)
      const distanceInMeters = distance * 111000;
      setDistanceToNextTarget(distanceInMeters);
    }
  };

  // Initialize multiplayer connection
  useEffect(() => {
    if (!partyId || !userData.id) return;

    // Set up event handlers
    multiplayerConnection.onNewPartyMember = (message) => {
      console.log(`New player joined: ${message.name}`);
    };

    multiplayerConnection.onDisconnect = (userId) => {
      console.log(`Player disconnected: ${userId}`);
      setOtherPlayers((prev) => {
        const newPlayers = new Map(prev);
        newPlayers.delete(userId);
        return newPlayers;
      });
    };

    multiplayerConnection.onPositionUpdate = (userId, position, rotation) => {
      setOtherPlayers((prev) => {
        const newPlayers = new Map(prev);
        const playerName =
          multiplayerConnection.partyMembers.get(userId) || `Player ${userId}`;
        newPlayers.set(userId, {
          id: userId,
          position,
          rotation,
          name: playerName,
        });
        return newPlayers;
      });
    };

    // Connect to WebSocket server
    multiplayerConnection.connect(userData.id, partyId);

    // Cleanup function
    return () => {
      multiplayerConnection.disconnect();
    };
  }, [partyId, userData.id]);

  // Send position updates to other players
  useEffect(() => {
    if (!multiplayerConnection.isConnected || !raceStarted) return;

    const sendPositionInterval = setInterval(() => {
      const { carPosition, carHeading } = carPhysics.current;

      if (!carPosition) return;

      // Convert position and heading to the format expected by the server
      const position = {
        x: carPosition[0],
        y: carPhysics.current.getElevation() || 0,
        z: carPosition[1],
      };

      const rotation = {
        yaw: (carHeading * 180) / Math.PI,
        pitch: 0, // Could calculate from terrain
        roll: 0, // Could calculate from terrain
      };

      multiplayerConnection.sendPosition(position, rotation);
    }, 100); // Send updates 10 times per second

    return () => clearInterval(sendPositionInterval);
  }, [raceStarted]);

  useEffect(() => {
    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: carPhysics.current.carPosition,
      zoom: 22,
      pitch: 55,
      bearing: (carPhysics.current.carHeading * 180) / Math.PI, // Use car's heading in degrees
      antialias: false,
      config: {
        basemap: {
          lightPreset: lightPreset, // dawn, day, dusk, or night
          showPointOfInterestLabels: true,
          showPlaceLabels: true,
        },
      },
    });
    mapRef.current = map;

    map.on("load", () => {
      // Add fog for view distance optimization
      map.setFog({
        color: "rgb(220, 220, 230)", // Light fog color
        "high-color": "rgb(180, 180, 200)", // Sky color
        "horizon-blend": 0.2, // Smooth transition between fog and sky
        "space-color": "rgb(140, 150, 180)", // Upper atmosphere
        "star-intensity": 0.15, // Slight star visibility
        range: [4, 8], // Start and end distances for fog effect (in km)
      });

      // (Optional) 3D buildings if the style has a "composite" source
      if (map.getSource("composite")) {
        map.addLayer({
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", ["get", "extrude"], "true"],
          type: "fill-extrusion",
          minzoom: 15,
          maxzoom: 15,
          paint: {
            "fill-extrusion-color": "#aaa",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 1,
          },
        });
      }

      // Apply weather effects based on the weather prop
      if (weather === "rain") {
        map.setRain({
          density: 0.5,
          intensity: 1.0,
          color: "#a8adbc",
          opacity: 0.7,
          vignette: 1.0,
          "vignette-color": "#464646",
          direction: [0, 80],
          "droplet-size": [2.6, 18.2],
          "distortion-strength": 0.7,
          "center-thinning": 0, // Rain to be displayed on the whole screen area
        });
      } else if (weather === "snow") {
        map.setSnow({
          density: 0.85,
          intensity: 1.0,
          color: "#ffffff",
          opacity: 1.0,
          vignette: 0.3,
          "vignette-color": "#ffffff",
          direction: [0, 50],
          "particle-size": [1.0, 2.0],
          "center-thinning": 0.1,
        });
      }

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
            "/models/low_poly_nissan_gtr.glb",
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
              carPhysics.current.modelLoaded = true;
              setModelLoaded(true);
            },
            (xhr) => {
              // Loading progress callback (optional)
              const progress = (xhr.loaded / xhr.total) * 100;
              console.log(`Car model loading: ${Math.round(progress)}%`);
            },
            (error) => {
              console.error("Error loading car model:", error);
              // Create a simple car placeholder instead of failing
              const geometry = new THREE.BoxGeometry(1, 0.5, 2);
              const material = new THREE.MeshStandardMaterial({
                color: 0x3080ff,
                emissive: 0x1040a0,
                metalness: 0.8,
                roughness: 0.2,
              });
              this.carModel = new THREE.Mesh(geometry, material);

              // Add simple details to make it look like a car
              const roof = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.3, 1),
                material
              );
              roof.position.set(0, 0.4, -0.2);
              this.carModel.add(roof);

              this.scene.add(this.carModel);
              carPhysics.current.modelLoaded = true;
              setModelLoaded(true);
            }
          );

          // Renderer
          this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: false,
          });
          this.renderer.autoClear = false;
        },

        render: function (gl, matrix) {
          // Skip rendering if primary car model isn't loaded
          if (!this.carModel) return;

          const { carPosition, carHeading } = carPhysics.current;
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

          map.triggerRepaint();
        },
      });

      // Add custom layer for multiplayer vehicles
      map.addLayer({
        id: "multiplayer-vehicles",
        type: "custom",
        renderingMode: "3d",

        onAdd: function (map, gl) {
          this.camera = new THREE.Camera();
          this.scene = new THREE.Scene();

          // Lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
          this.scene.add(ambientLight);

          const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
          dirLight.position.set(0, 5, 5).normalize();
          this.scene.add(dirLight);

          // Renderer
          this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: false,
          });
          this.renderer.autoClear = false;
        },

        render: function (gl, matrix) {
          // Skip if no other players
          if (otherPlayers.size === 0) return;

          // Update position of all multiplayer vehicles
          otherPlayers.forEach((player) => {
            // Skip rendering self
            if (player.id === userData.id) return;

            // Get player position in mercator coordinates
            const merc = mapboxgl.MercatorCoordinate.fromLngLat(
              [player.position.x, player.position.z],
              player.position.y
            );

            // Scale factor
            const modelScale = merc.meterInMercatorCoordinateUnits();

            // Create transform matrix
            let modelMatrix = new THREE.Matrix4();

            // Position
            const translateMatrix = new THREE.Matrix4().makeTranslation(
              merc.x,
              merc.y,
              merc.z
            );

            // Scale
            const scaleMatrix = new THREE.Matrix4().makeScale(
              modelScale,
              modelScale,
              modelScale
            );

            // Rotation - convert yaw to radians
            const yawRadians = (player.rotation.yaw * Math.PI) / 180;
            const rotationMatrix = new THREE.Matrix4().makeRotationZ(
              yawRadians
            );

            // Upright orientation
            const uprightMatrix = new THREE.Matrix4().makeRotationAxis(
              new THREE.Vector3(1, 0, 0),
              Math.PI / 2
            );

            // Combine transformations
            modelMatrix
              .multiply(translateMatrix)
              .multiply(scaleMatrix)
              .multiply(rotationMatrix)
              .multiply(uprightMatrix);

            // Update mesh
            if (multiplayerVehiclesRef.current.has(player.id)) {
              const vehicle = multiplayerVehiclesRef.current.get(player.id);
              vehicle.matrix.copy(modelMatrix);
              vehicle.matrixAutoUpdate = false;
            } else {
              // Create placeholder for now (actual model would be better)
              const geometry = new THREE.BoxGeometry(1, 0.5, 2);
              const material = new THREE.MeshStandardMaterial({
                color: 0xff4040,
                metalness: 0.7,
                roughness: 0.3,
              });
              const vehicleMesh = new THREE.Mesh(geometry, material);
              vehicleMesh.matrix.copy(modelMatrix);
              vehicleMesh.matrixAutoUpdate = false;

              this.scene.add(vehicleMesh);
              multiplayerVehiclesRef.current.set(player.id, vehicleMesh);
            }
          });

          // Render the scene with all multiplayer vehicles
          const projectionMatrix = new THREE.Matrix4().fromArray(matrix);
          this.camera.projectionMatrix = projectionMatrix;
          this.renderer.resetState();
          this.renderer.render(this.scene, this.camera);

          map.triggerRepaint();
        },
      });

      setIsMapLoaded(true);
    });

    return () => map.remove();
  }, [lightPreset, otherPlayers]);

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
        carPhysics.current.setControl(control, true);
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
        carPhysics.current.setControl(control, false);
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
    if (carPhysics.current.raceStartTime === 0) {
      carPhysics.current.startRaceTimer();
    }

    let animationId;
    let lastCompassUpdateTime = 0;

    const gameLoop = (timestamp) => {
      const state = carPhysics.current;

      const deltaTime = state.lastFrame ? timestamp - state.lastFrame : 16.67;
      state.lastFrame = timestamp;
      const dt = Math.min(deltaTime, 100) / 1000;

      // Track frame times for FPS calculation
      frameTimesRef.current.push(deltaTime);
      // Keep only the last 20 frames for averaging
      if (frameTimesRef.current.length > 20) {
        frameTimesRef.current.shift();
      }

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

      // Calculate average FPS every 10 frames
      if (timestamp % 100 < 16) {
        const avgFrameTime =
          frameTimesRef.current.reduce((acc, time) => acc + time, 0) /
          frameTimesRef.current.length;
        const calculatedFps = Math.round(1000 / avgFrameTime);
        setFps(calculatedFps);
      }

      // Update car physics
      const handleOffTrack = (message) => {
        if (!offTrackWarning) {
          setOffTrackWarning(true);
          setTimeout(() => setOffTrackWarning(false), 1500);
        }
      };

      const handleWarningZone = (message) => {
        if (!warningZoneAlert) {
          setWarningZoneAlert(true);
          setTimeout(() => setWarningZoneAlert(false), 1000);
        }
      };

      // Update physics and get new state
      const carState = carPhysics.current.update(
        dt,
        routeCoordinates,
        handleOffTrack,
        handleWarningZone
      );

      // Move camera with the car
      if (mapRef.current) {
        const headingDeg = ((carState.heading * 180) / Math.PI) % 360;
        mapRef.current.jumpTo({
          center: carState.position,
          bearing: headingDeg,
          pitch: 75,
        });
        mapRef.current.triggerRepaint();
      }

      // Debug info ~5 times/sec
      if (timestamp % 200 < 16) {
        setDebugInfo((prev) => ({
          ...prev,
          position: [...carState.position],
          heading: carState.heading,
          speed: carState.speed,
        }));
      }

      // Update race time if race is ongoing
      if (!carPhysics.current.raceComplete) {
        const currentRaceTime =
          (performance.now() - carPhysics.current.raceStartTime) / 1000;
        if (timestamp % 100 < 16) {
          // Update UI ~10 times/sec
          setRaceTime(currentRaceTime);
        }
      }

      // Update compass direction more frequently
      if (timestamp - lastCompassUpdateTime > 50) {
        // Update every ~50ms
        lastCompassUpdateTime = timestamp;
        updateCompassDirection();
      }

      // Check race progress
      checkRaceProgress();

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [isMapLoaded, raceStarted, routeCoordinates, offTrackWarning]);

  // Add players list UI to the race view
  const renderPlayersList = () => {
    // Filter out disconnected players and self
    const players = Array.from(
      multiplayerConnection.partyMembers.entries()
    ).filter(([id]) => id !== userData.id);

    if (players.length === 0) return null;

    return (
      <div className="absolute top-4 right-4 bg-black bg-opacity-70 p-2 rounded-lg text-white">
        <h3 className="text-sm font-bold mb-1">Other Racers</h3>
        <ul className="text-xs">
          {players.map(([id, name]) => (
            <li key={id} className="flex items-center my-1">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
              {name}
            </li>
          ))}
        </ul>
      </div>
    );
  };

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

      {/* FPS counter - always visible during gameplay */}
      {raceStarted && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-60 text-white px-2 py-1 rounded-lg text-sm">
          <div className="font-mono">{fps} FPS</div>
        </div>
      )}

      {/* Race timer UI */}
      {raceStarted && !raceComplete && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white p-3 rounded-lg">
          <div className="text-xl font-bold">{raceTime.toFixed(2)}s</div>

          {/* Weather and time indicator */}
          <div className="mt-1 flex justify-between items-center text-xs text-gray-300">
            <div className="flex items-center">
              {timeOfDay === "dawn" && <span>🌅 Dawn</span>}
              {timeOfDay === "day" && <span>☀️ Day</span>}
              {timeOfDay === "dusk" && <span>🌆 Dusk</span>}
              {timeOfDay === "night" && <span>🌙 Night</span>}
            </div>
            <div className="ml-4 flex items-center">
              {weather === "clear" && <span>☀️ Clear</span>}
              {weather === "rain" && <span>🌧️ Rain</span>}
              {weather === "snow" && <span>❄️ Snow</span>}
            </div>
          </div>

          {/* Route distance */}
          {debugInfo.routeDistance && (
            <div className="text-xs text-gray-300 mt-1">
              Race distance: {(debugInfo.routeDistance / 1000).toFixed(2)} km
            </div>
          )}

          {/* Checkpoint progress indicator */}
          {formattedCheckpoints && formattedCheckpoints.length > 0 && (
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

      {/* Warning zone alert - less severe than off-track */}
      {warningZoneAlert && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                      bg-yellow-500 bg-opacity-60 text-white px-6 py-3 rounded-lg text-xl font-bold"
        >
          Warning: Getting off track!
        </div>
      )}

      {/* Off-track warning - update styling to be more severe */}
      {offTrackWarning && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                      bg-red-600 bg-opacity-70 text-white px-6 py-3 rounded-lg text-xl font-bold"
        >
          Turn around! You're too far from the track!
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

      {/* Compass overlay */}
      {raceStarted && !raceComplete && (
        <div className="absolute top-1/2 right-8 transform -translate-y-1/2">
          <div className="relative">
            {/* Minimalist compass background */}
            <div
              className="w-24 h-24 rounded-full backdrop-blur-sm bg-black bg-opacity-20 flex items-center justify-center overflow-hidden border border-white border-opacity-10"
              style={{ boxShadow: "0 0 10px rgba(0, 0, 0, 0.2)" }}
            >
              {/* Simple ring */}
              <div className="absolute w-full h-full rounded-full border border-white border-opacity-20"></div>

              {/* Cardinal directions */}
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-white text-xs font-light">
                N
              </div>
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white text-xs font-light opacity-50">
                S
              </div>
              <div className="absolute top-1/2 left-2 transform -translate-y-1/2 text-white text-xs font-light opacity-50">
                W
              </div>
              <div className="absolute top-1/2 right-2 transform -translate-y-1/2 text-white text-xs font-light opacity-50">
                E
              </div>

              {/* Minimal tick marks - only at cardinal points */}
              {[0, 90, 180, 270].map((angle, i) => (
                <div
                  key={i}
                  className="absolute w-0.5 h-1.5 bg-white bg-opacity-30"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-11px)`,
                    transformOrigin: "center 12px",
                  }}
                ></div>
              ))}

              {/* Compass base - non-rotating */}
              <div className="absolute w-full h-full flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full"></div>
              </div>

              {/* Direction arrow - clear styling to debug */}
              <div
                className="absolute w-full h-full top-1/2 left-1/2 pointer-events-none"
                style={{
                  transform: `translate(-50%, -50%) rotate(${compassDirection}deg)`,
                  transition: "transform 0.15s ease-out",
                }}
                data-angle={compassDirection.toFixed(0)}
              >
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  {/* Arrow outline for better visibility */}
                  <path
                    d="M50,20 L56,50 L50,45 L44,50 L50,20Z"
                    fill="white"
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth="1"
                    fillOpacity="0.9"
                  />
                </svg>
              </div>
            </div>

            {/* Target info - minimalist */}
            <div className="mt-2 backdrop-blur-sm bg-black bg-opacity-20 py-1.5 px-3 rounded text-center border-t border-white border-opacity-10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white text-xs font-light">
                  {nextTargetName}
                </span>
                <span className="text-white text-xs opacity-75 font-light">
                  {distanceToNextTarget < 100
                    ? `${Math.round(distanceToNextTarget)}m`
                    : `${(distanceToNextTarget / 1000).toFixed(1)}km`}
                </span>
              </div>
            </div>

            {/* Debug info - angle display */}
            <div className="mt-1 text-white text-[10px] text-center opacity-50">
              Dir: {Math.round(compassDirection)}°
            </div>
          </div>
        </div>
      )}

      {/* Speedometer - show only during active race */}
      {raceStarted && !raceComplete && (
        <div className="absolute bottom-4 right-4 bg-black bg-opacity-60 text-white p-3 rounded-lg flex flex-col items-center justify-center">
          <div className="text-3xl font-bold">
            {Math.round(debugInfo.speed * 3000000 * 0.621371)} mph
          </div>
          <div className="text-xs text-gray-300">SPEED</div>
        </div>
      )}

      {/* Multiplayer players list */}
      {renderPlayersList()}
    </div>
  );
}
