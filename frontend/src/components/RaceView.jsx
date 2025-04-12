import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import CarPhysics from "../car/physics";

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
  timeOfDay = "day",
  weather = "clear",
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
  const [optimizedCheckpoints, setOptimizedCheckpoints] = useState([]);
  // Add FPS state
  const [fps, setFps] = useState(0);
  // Store the frame times for averaging (past 20 frames)
  const frameTimesRef = useRef([]);

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

  // Race progress state
  const [checkpointStatus, setCheckpointStatus] = useState([]);
  const [raceComplete, setRaceComplete] = useState(false);
  const [raceTime, setRaceTime] = useState(0);

  // Initialize checkpoint status and finish position
  useEffect(() => {
    // Ensure we're using consistent finish position
    carPhysics.current.actualFinishPosition = actualFinishPosition;

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
    carPhysics.current.carHeading = initialHeading;

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
      carPhysics.current.checkpointsPassed = initialStatus;
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

    // Reset physics using the CarPhysics class
    carPhysics.current.reset(initialPosition, initialHeading, resetStatus);
    carPhysics.current.modelLoaded = false;

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
  }, [isMapLoaded, modelLoaded]);

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
        const distance = carPhysics.current.calculateDistance(carPosition, checkpointPosition);

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
        const finishDistance = carPhysics.current.calculateDistance(carPosition, finishPos);

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
    } else if (checkpoints && checkpoints.length > 0) {
      // Fallback to original checkpoints if optimizedCheckpoints not ready
      let allPassed = true;

      const newStatus = [
        ...(carPhysics.current.checkpointsPassed ||
          Array(checkpoints.length).fill(false)),
      ];
      checkpoints.forEach((checkpoint, index) => {
        // Check if car is within range of checkpoint
        const distance = carPhysics.current.calculateDistance(carPosition, checkpoint);

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
        const finishDistance = carPhysics.current.calculateDistance(carPosition, finishPos);
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
      const finishDistance = carPhysics.current.calculateDistance(carPosition, finishPos);

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

  useEffect(() => {
    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: carPhysics.current.carPosition,
      zoom: 21,
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
        range: [1, 8], // Start and end distances for fog effect (in km)
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
              carPhysics.current.modelLoaded = true;
              setModelLoaded(true);
            },
            undefined,
            (error) => {
              console.error("Error loading car model:", error);
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

      setIsMapLoaded(true);
    });

    return () => map.remove();
  }, [
    initialPosition,
    defaultFinishPosition,
    checkpoints,
    lightPreset,
    weather,
    timeOfDay,
  ]);

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
        const avgFrameTime = frameTimesRef.current.reduce((acc, time) => acc + time, 0) /
          frameTimesRef.current.length;
        const calculatedFps = Math.round(1000 / avgFrameTime);
        setFps(calculatedFps);
      }


      // Update car physics
      const handleOffTrack = () => {
        if (!offTrackWarning) {
          setOffTrackWarning(true);
          setTimeout(() => setOffTrackWarning(false), 1000);
        }
      };

      // Update physics and get new state
      const carState = carPhysics.current.update(dt, routeCoordinates, handleOffTrack);

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
          {checkpoints && checkpoints.length > 0 && (
            <div className="mt-2">
              <div className="text-xs mb-1">Checkpoints:</div>
              <div className="flex gap-2">
                {checkpointStatus.map((passed, index) => (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full ${passed ? "bg-green-500" : "bg-gray-500"
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
