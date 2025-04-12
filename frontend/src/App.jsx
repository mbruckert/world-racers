import { useState, useEffect } from "react";
import "./App.css";
import MapBuilder from "./components/MapBuilder";
import DroneShotOne from "./components/DroneShots/DroneShotOne";
import RaceView from "./components/RaceView";

function App() {
  const [startPosition, setStartPosition] = useState(null);
  const [endPosition, setEndPosition] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [locationName, setLocationName] = useState("");
  const [flowState, setFlowState] = useState("building"); // building, preview, racing
  const [error, setError] = useState("");

  useEffect(() => {
    // Reset error when flow state changes
    setError("");
  }, [flowState]);

  const handleRouteSubmit = (routeData) => {
    // Extract route data from the object that MapBuilder now sends
    const {
      startPosition: start,
      finishPosition: end,
      checkpoints: waypoints,
      locationName: location,
    } = routeData;

    console.log("App received route data:", routeData);

    if (!start || !end) {
      setError("Missing start or end position. Please select both on the map.");
      return;
    }

    setStartPosition(start);
    setEndPosition(end);
    setCheckpoints(waypoints || []);
    setLocationName(location || "");
    setFlowState("preview");
  };

  const handlePreviewComplete = () => {
    setFlowState("racing");
  };

  const resetFlow = () => {
    // Confirm before resetting if in racing mode
    if (flowState === "racing") {
      if (window.confirm("Are you sure you want to build a new route?")) {
        setFlowState("building");
      }
    } else {
      setFlowState("building");
    }
  };

  return (
    <div className="w-full h-screen">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
          {error}
        </div>
      )}

      {flowState === "building" && (
        <MapBuilder onRouteSubmit={handleRouteSubmit} />
      )}

      {flowState === "preview" && (
        <div className="relative h-full">
          <DroneShotOne
            startPosition={startPosition}
            endPosition={endPosition}
            checkpoints={checkpoints}
            locationName={locationName}
            onAnimationComplete={handlePreviewComplete}
          />
          <button
            onClick={resetFlow}
            className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow"
          >
            Cancel Preview
          </button>
        </div>
      )}

      {flowState === "racing" && (
        <div className="relative h-full">
          <RaceView
            startPosition={startPosition}
            finishPosition={endPosition}
            checkpoints={checkpoints}
          />
          <button
            onClick={resetFlow}
            className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow"
          >
            Build New Route
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
