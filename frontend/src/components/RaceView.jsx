import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function RaceView({ startPosition }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [raceStarted, setRaceStarted] = useState(false);

  // Initialize carPosition from props or default
  const initialPosition = useMemo(() => {
    return startPosition || [-81.1989, 28.6024];
  }, [startPosition]);

  // Game state
  const gameState = useRef({
    // Position & motion
    carPosition: initialPosition, // Use memoized initial position
    carHeading: 0, // radians, 0 is north
    carSpeed: 0,
    carVelocity: [0, 0],

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
  });

  // Debug UI state
  const [debugInfo, setDebugInfo] = useState({
    position: initialPosition,
    heading: 0,
    speed: 0,
    activeKeys: [],
  });

  // Start the countdown when model is loaded
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

  useEffect(() => {
    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: gameState.current.carPosition,
      zoom: 21,
      pitch: 55,
      bearing: 0,
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

      map.setRain({
        density: 0.5,
        intensity: 1.0,
        color: "#a8adbc",
        opacity: 0.7,
        vignette: 1,
        "vignette-color": "#464646",
        direction: [0, 80],
        "droplet-size": [2.6, 18.2],
        "distortion-strength": 0.7,
        "center-thinning": 0, // Rain to be displayed on the whole screen area
      });

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

          // Load car model
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
              console.log("Model loaded successfully");
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
            antialias: true,
          });
          this.renderer.autoClear = false;
        },

        render: function (gl, matrix) {
          if (!this.carModel) return;

          const { carPosition, carHeading } = gameState.current;
          const elevation = map.queryTerrainElevation(carPosition) || 0;

          // ====== TERRAIN TILT LOGIC ======
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

          // ====== BUILD MODEL MATRIX ======
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

          // Render
          this.renderer.resetState();
          this.renderer.render(this.scene, this.camera);
          map.triggerRepaint();
        },
      });

      setIsMapLoaded(true);
    });

    return () => map.remove();
  }, [initialPosition]);

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

        const newPos = [
          state.carPosition[0] + state.carVelocity[0],
          state.carPosition[1] + state.carVelocity[1],
        ];

        state.carPosition = newPos;
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

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [isMapLoaded, raceStarted]);

  return (
    <div className="w-full h-full relative">
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
