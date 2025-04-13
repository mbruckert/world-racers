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
      id,
      title,
      description,
      startPosition: start,
      finishPosition: end,
      checkpoints: waypoints,
      locationName: location,
      timeOfDay: time,
      weather: weatherCondition,
      start_longitude,
      start_latitude,
      end_longitude,
      end_latitude,
    } = routeData;

    console.log("App received route data:", routeData);

    if (!start || !end) {
      setError("Missing start or end position. Please select both on the map.");
      return;
    }

    // Store complete map data
    setSelectedMap({
      id: id,
      title: title || location || "",
      description: description || "",
      start_longitude: start_longitude || start[0],
      start_latitude: start_latitude || start[1],
      end_longitude: end_longitude || end[0],
      end_latitude: end_latitude || end[1],
      checkpoints:
        waypoints?.map((point, index) => ({
          longitude: point[0],
          latitude: point[1],
          position: index + 1,
        })) || [],
    });

    setStartPosition(start);
    setEndPosition(end);
    setCheckpoints(waypoints || []);

    // Set location name ensuring we use the most specific information
    const mapName = title || location || "Unknown Location";
    console.log("Setting location name in handleRouteSubmit:", mapName);
    setLocationName(mapName);

    setTimeOfDay(time || "day");
    setWeather(weatherCondition || "clear");

    // Go to room creation instead of preview
    setFlowState("room");
  };

  const handleSelectMap = (map) => {
    console.log("Selected map:", map);

    // Store complete map data with all necessary fields
    setSelectedMap({
      ...map,
      id: map.id,
      title: map.title || "Unknown Location",
      description: map.description || "",
    });

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

    // Set the location name from the map title
    console.log("Setting location name in handleSelectMap:", map.title);
    setLocationName(map.title || "Unknown Location");

    // Debug check before transitioning
    console.log("Map data before room transition:", {
      selectedMap: { ...map },
      locationName: map.title || "Unknown Location",
    });

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

      // Set location name from map data title
      if (partyData.mapData.title) {
        console.log("Setting location name to:", partyData.mapData.title);
        setLocationName(partyData.mapData.title);
      }

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

      // For race owner, log current coordinates for debugging
      console.log("Race owner starting with coordinates:", {
        startPosition,
        endPosition,
        checkpoints: checkpoints.length > 0 ? checkpoints : "none",
        locationName,
      });

      // Make sure to set the location name from the selectedMap if available
      if (selectedMap && selectedMap.title) {
        console.log(
          "Setting location name from selectedMap:",
          selectedMap.title
        );
        setLocationName(selectedMap.title);
      }

      // Ensure the coordinates are in the correct format for the owner too
      // This is important because sometimes the coordinates might not be in the expected array format
      if (
        startPosition &&
        typeof startPosition[0] === "number" &&
        typeof startPosition[1] === "number"
      ) {
        console.log("Start position already in correct format:", startPosition);
      } else if (
        startPosition &&
        startPosition.longitude &&
        startPosition.latitude
      ) {
        // Convert to array format if in object format
        const formattedStart = [
          startPosition.longitude,
          startPosition.latitude,
        ];
        console.log(
          "Converting start position to correct format:",
          formattedStart
        );
        setStartPosition(formattedStart);
      }

      if (
        endPosition &&
        typeof endPosition[0] === "number" &&
        typeof endPosition[1] === "number"
      ) {
        console.log("End position already in correct format:", endPosition);
      } else if (endPosition && endPosition.longitude && endPosition.latitude) {
        // Convert to array format if in object format
        const formattedEnd = [endPosition.longitude, endPosition.latitude];
        console.log("Converting end position to correct format:", formattedEnd);
        setEndPosition(formattedEnd);
      }

      // Check and format checkpoints for consistency
      if (checkpoints && checkpoints.length > 0) {
        // Ensure all checkpoints are in [longitude, latitude] array format
        const formattedCheckpoints = checkpoints
          .map((checkpoint) => {
            // If checkpoint is already an array [lng, lat], return as is
            if (
              Array.isArray(checkpoint) &&
              checkpoint.length === 2 &&
              typeof checkpoint[0] === "number" &&
              typeof checkpoint[1] === "number"
            ) {
              return checkpoint;
            }
            // If checkpoint is an object with latitude/longitude properties
            else if (
              checkpoint &&
              typeof checkpoint === "object" &&
              "longitude" in checkpoint &&
              "latitude" in checkpoint
            ) {
              return [checkpoint.longitude, checkpoint.latitude];
            }
            return null;
          })
          .filter((checkpoint) => checkpoint !== null);

        if (formattedCheckpoints.length !== checkpoints.length) {
          console.log("Reformatted checkpoints:", formattedCheckpoints);
          setCheckpoints(formattedCheckpoints);
        }
      }
    }

    // Debug log final locationName value before transition
    console.log("FINAL locationName before preview:", locationName);

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

        // Set location name from map data title
        if (partyData.mapData.title) {
          console.log("Setting location name to:", partyData.mapData.title);
          setLocationName(partyData.mapData.title);
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
          key={`room-${selectedMap?.id || "new"}-${Date.now()}`}
        />
      )}

      {flowState === "preview" && (
        <div className="relative h-full">
          <DroneShotOne
            key={`drone-${locationName}-${Date.now()}`}
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
