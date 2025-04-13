import { useState, useEffect } from "react";
import "./App.css";
import MapBuilder from "./components/MapBuilder";
import MapBuilderExtended from "./components/MapBuilderExtended";
import DroneShotOne from "./components/DroneShots/DroneShotOne";
import RaceView from "./components/RaceView";
import StartScreen from "./components/StartScreen";
import AuthScreen from "./components/AuthScreen";
import MapSelectScreen from "./components/MapSelectScreen";
import RoomScreen from "./components/RoomScreen";
import JoinPartyScreen from "./components/JoinPartyScreen";
import { isAuthenticated, getAuthData, fetchWithAuth } from "./utils/auth";

function App() {
  const [startPosition, setStartPosition] = useState(null);
  const [endPosition, setEndPosition] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [locationName, setLocationName] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [weather, setWeather] = useState("clear");
  const [flowState, setFlowState] = useState("start"); // auth, start, mapSelect, building, preview, racing, room, joinParty
  const [error, setError] = useState("");
  const [selectedMap, setSelectedMap] = useState(null);
  const [party, setParty] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    if (isAuthenticated() || demoMode) {
      // If already authenticated or in demo mode, go to start screen
      setFlowState("start");
    } else {
      // Need to authenticate first
      setFlowState("auth");
    }
    // Reset error when component mounts or flow state changes
    setError("");
  }, [demoMode]);

  const handleAuthenticated = (authData) => {
    console.log("User authenticated:", authData);
    setFlowState("start");
  };

  const handleRouteSubmit = (routeData) => {
    // Extract route data from the object that MapBuilder now sends
    const {
      startPosition: start,
      finishPosition: end,
      checkpoints: waypoints,
      locationName: location,
      timeOfDay: time,
      weather: weatherCondition,
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
    setTimeOfDay(time || "day");
    setWeather(weatherCondition || "clear");

    // Go to room creation instead of preview
    setFlowState("room");
  };

  const handleSelectMap = (map) => {
    setSelectedMap(map);
    // Convert the map data from API format to app format
    setStartPosition([map.start_longitude, map.start_latitude]);
    setEndPosition([map.end_longitude, map.end_latitude]);

    // Assuming checkpoints are provided in the selected map
    if (map.checkpoints && Array.isArray(map.checkpoints)) {
      // Transform the checkpoints to the format the app expects
      const formattedCheckpoints = map.checkpoints.map((cp) => [
        cp.longitude,
        cp.latitude,
      ]);
      setCheckpoints(formattedCheckpoints);
    } else {
      setCheckpoints([]);
    }

    setLocationName(map.title || "");

    // Go to room creation instead of preview
    setFlowState("room");
  };

  const handleStartRace = (partyData) => {
    setParty(partyData);
    console.log("handleStartRace received party data:", partyData);

    // Check if this party has map data (for joiners)
    if (partyData.mapData) {
      console.log("Received map data with party:", partyData.mapData);
      console.log("Setting coordinates from map data");

      // Update the map data
      setSelectedMap(partyData.mapData);

      // Set start and end positions
      const startPos = [
        partyData.mapData.start_longitude,
        partyData.mapData.start_latitude,
      ];
      const endPos = [
        partyData.mapData.end_longitude,
        partyData.mapData.end_latitude,
      ];

      console.log("Start position set to:", startPos);
      console.log("End position set to:", endPos);

      setStartPosition(startPos);
      setEndPosition(endPos);

      // Set checkpoints if available
      if (
        partyData.mapData.checkpoints &&
        Array.isArray(partyData.mapData.checkpoints)
      ) {
        const formattedCheckpoints = partyData.mapData.checkpoints.map((cp) => [
          cp.longitude,
          cp.latitude,
        ]);
        console.log("Setting checkpoints:", formattedCheckpoints);
        setCheckpoints(formattedCheckpoints);
      } else {
        console.log("No checkpoints in map data or invalid format");
      }
    } else {
      console.log(
        "No map data found in party data, using existing map settings"
      );
    }

    // Go to preview before racing
    setFlowState("preview");
  };

  const handlePreviewComplete = () => {
    // After preview completes, go to racing
    console.log(
      "Preview complete, transitioning to race view with party:",
      party?.id
    );
    console.log("Map data going into race:", {
      startPosition,
      endPosition,
      checkpoints: checkpoints.length,
    });

    // Explicitly avoid breaking the WebSocket connection during transition
    setFlowState("racing");
  };

  const handleCreateGame = () => {
    setFlowState("mapSelect");
  };

  const handleJoinGame = (partyData) => {
    setParty(partyData);

    // If demo mode, check for the special demo flag
    if (partyData.isGuestMode) {
      setDemoMode(true);

      // Set up dummy map data from the party
      if (partyData.mapData) {
        setSelectedMap(partyData.mapData);
        setStartPosition([
          partyData.mapData.start_longitude,
          partyData.mapData.start_latitude,
        ]);
        setEndPosition([
          partyData.mapData.end_longitude,
          partyData.mapData.end_latitude,
        ]);

        // Format checkpoints properly
        if (
          partyData.mapData.checkpoints &&
          Array.isArray(partyData.mapData.checkpoints)
        ) {
          const formattedCheckpoints = partyData.mapData.checkpoints.map(
            (cp) => [cp.longitude, cp.latitude]
          );
          setCheckpoints(formattedCheckpoints);
        }
      }

      // Skip directly to preview
      setFlowState("preview");
    } else {
      // If a regular party, go to room screen first

      // If this is a party being joined (not created), fetch the map data
      if (partyData.isJoiner) {
        // We need to set the selected map to the party itself temporarily
        // The RoomScreen component will use this until proper map data is fetched
        setSelectedMap(partyData);
      }

      setFlowState("room");
    }
  };

  const handleCreateNewMap = () => {
    setFlowState("building");
  };

  const handleBypass = () => {
    setFlowState("building");
  };

  const handleCancelRoom = () => {
    setFlowState("mapSelect");
  };

  const handleCancelJoin = () => {
    setFlowState("start");
  };

  return (
    <div className="w-full h-screen">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
          {error}
        </div>
      )}

      {flowState === "auth" && (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      )}

      {flowState === "start" && (
        <StartScreen
          handleBypass={handleBypass}
          handleCreateGame={handleCreateGame}
          handleJoinGame={handleJoinGame}
        />
      )}

      {flowState === "joinParty" && (
        <JoinPartyScreen
          onJoined={handleJoinGame}
          onCancel={handleCancelJoin}
        />
      )}

      {flowState === "mapSelect" && (
        <MapSelectScreen
          onCreateNew={handleCreateNewMap}
          onSelectMap={handleSelectMap}
        />
      )}

      {flowState === "building" && (
        <MapBuilderExtended onRouteSubmit={handleRouteSubmit} />
      )}

      {flowState === "room" && (
        <RoomScreen
          mapData={selectedMap}
          onStartRace={handleStartRace}
          onCancel={handleCancelRoom}
          party={party}
        />
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
            onClick={handlePreviewComplete}
            className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow"
          >
            Skip Preview
          </button>
        </div>
      )}

      {flowState === "racing" && (
        <div className="relative h-full">
          <RaceView
            startPosition={startPosition}
            finishPosition={endPosition}
            checkpoints={checkpoints}
            timeOfDay={timeOfDay}
            weather={weather}
            partyId={demoMode ? "demo-party" : party?.id}
          />
        </div>
      )}
    </div>
  );
}

export default App;
