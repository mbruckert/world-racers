import { useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";
import { fetchWithAuth, getUserData, fetchUserData } from "../utils/auth";
import multiplayerConnection from "../utils/websocket";

export default function RoomScreen({
  mapData,
  onStartRace,
  onCancel,
  party: initialParty,
}) {
  const [party, setParty] = useState(initialParty || null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingParty, setIsCreatingParty] = useState(false);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [userData, setUserData] = useState(getUserData());
  const [partyMapData, setPartyMapData] = useState(null);
  const [isMapLoading, setIsMapLoading] = useState(false);

  // Check if the user is a joiner (not the owner)
  const isJoiner = party && party.isJoiner === true;

  // Fetch user data if not available
  useEffect(() => {
    if (!userData.id) {
      const getUserInfo = async () => {
        try {
          const data = await fetchUserData();
          setUserData(data);
        } catch (err) {
          console.error("Error fetching user data:", err);
        }
      };
      getUserInfo();
    }
  }, [userData.id]);

  // Fetch map data for the party
  useEffect(() => {
    // Log the current state to debug why fetching might not happen
    console.log("Map fetch condition check:", {
      hasParty: !!party,
      partyMapId: party?.map_id,
      hasPartyMapData: !!partyMapData,
      isLoading: isMapLoading,
      shouldFetch: !!(party && party.map_id && !partyMapData && !isMapLoading),
    });

    // Only fetch if we have a party with map_id but no map data yet
    if (party && party.map_id && !partyMapData && !isMapLoading) {
      const fetchMapDetails = async () => {
        try {
          setIsMapLoading(true);
          console.log(
            `Fetching map details for party ${party.id}, map ID: ${party.map_id}`
          );

          // Using the endpoint you provided
          const response = await fetchWithAuth(`/maps/${party.map_id}/details`);

          if (!response.ok) {
            throw new Error(`Failed to fetch map details (${response.status})`);
          }

          const mapDetails = await response.json();
          console.log("Retrieved map details:", mapDetails);

          // Extract the map and checkpoints
          const mapInfo = mapDetails.map;
          const checkpoints = mapDetails.checkpoints || [];

          // Enhance the map data with checkpoints
          const enhancedMapData = {
            ...mapInfo,
            checkpoints: checkpoints,
          };

          // Store the enhanced map data
          setPartyMapData(enhancedMapData);

          console.log(
            "Map data with checkpoints ready for when race starts:",
            enhancedMapData
          );
        } catch (err) {
          console.error("Error fetching map details:", err);
          setError(`Failed to load map details: ${err.message}`);
        } finally {
          setIsMapLoading(false);
        }
      };

      fetchMapDetails();
    }
  }, [party, mapData, partyMapData, isMapLoading]);

  // Only set up polling for members when we have a party
  useEffect(() => {
    if (!party) return;

    const fetchMembers = async () => {
      try {
        const response = await fetchWithAuth(`/parties/${party.id}/members`);
        if (response.ok) {
          const data = await response.json();
          setMembers(data);

          // Update the multiplayerConnection party members map
          data.forEach((member) => {
            multiplayerConnection.partyMembers.set(
              parseInt(member.id),
              member.name
            );
          });

          console.log(
            "Updated party members in multiplayerConnection:",
            Array.from(multiplayerConnection.partyMembers.entries())
          );
        }
      } catch (err) {
        console.error("Error fetching party members:", err);
      }
    };

    // Initial fetch
    fetchMembers();

    // Set up polling interval
    const interval = setInterval(fetchMembers, 5000);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [party]);

  // Set up WebSocket listener for RaceStarted event when party exists
  useEffect(() => {
    if (!party) return;

    // Define the handler for when a race starts
    const handleRaceStart = () => {
      console.log("🏁 Race start detected via WebSocket!");
      console.log(`Party ID: ${party.id}, User ID: ${userData.id}`);
      console.log("Transitioning to race view...");

      if (onStartRace) {
        // Include map data regardless of user role
        if (partyMapData) {
          // First priority: use fetched map data if available
          const partyWithMapData = {
            ...party,
            mapData: partyMapData,
          };
          console.log("Joining race with fetched map data:", partyMapData);
          console.log("Start coordinates:", [
            partyMapData.start_longitude,
            partyMapData.start_latitude,
          ]);
          console.log("End coordinates:", [
            partyMapData.end_longitude,
            partyMapData.end_latitude,
          ]);
          console.log("Checkpoints:", partyMapData.checkpoints);
          onStartRace(partyWithMapData);
        } else if (mapData) {
          // Second priority: use the map data passed to this component
          const partyWithMapData = {
            ...party,
            mapData: mapData,
          };
          console.log("Joining race with component map data:", mapData);
          onStartRace(partyWithMapData);
        } else {
          // Fallback to just the party
          console.log("No map data available, using party as is");
          onStartRace(party);
        }
      }
    };

    // Register the onRaceStart handler with the multiplayer connection
    multiplayerConnection.onRaceStart = handleRaceStart;
    console.log("Registered WebSocket listener for RaceStarted event");

    // Clean up when component unmounts
    return () => {
      multiplayerConnection.onRaceStart = null;
    };
  }, [party, onStartRace, userData.id, partyMapData, isJoiner]);

  // Update party if initialParty changes
  useEffect(() => {
    if (initialParty) {
      setParty(initialParty);

      // If joining a party (not creating), ensure WebSocket connection is established
      if (initialParty.isJoiner && userData.id) {
        // Connect to the party via WebSocket if not already connected
        multiplayerConnection.connect(userData.id, initialParty.id);
        console.log(`Connected to party ${initialParty.id} as joiner`);
      }
    }
  }, [initialParty, userData.id]);

  // Create a new party
  const createParty = async () => {
    if (party) return; // Don't create if we already have a party

    try {
      setIsCreatingParty(true);
      setError("");

      // Use actual user data
      const userId = userData.id;
      if (!userId) {
        throw new Error("User data not available. Please try again.");
      }

      const partyName = mapData?.title || "New Race";

      const response = await fetchWithAuth(`/parties`, {
        method: "POST",
        body: JSON.stringify({
          name: partyName,
          owner_id: userId,
          map_id: mapData.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create party");
      }

      const data = await response.json();

      // Connect to the websocket with the user ID and new party ID
      multiplayerConnection.connect(userId, data.id);
      console.log(`Connected to party ${data.id} as creator`);

      setParty(data);
    } catch (err) {
      setError(err.message || "Failed to create party. Please try again.");
    } finally {
      setIsCreatingParty(false);
    }
  };

  // Copy party code to clipboard
  const copyCodeToClipboard = () => {
    if (!party?.code) return;

    navigator.clipboard
      .writeText(party.code)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(() => {
        setError("Failed to copy code");
      });
  };

  // Start the race
  const handleStartRace = () => {
    if (party) {
      console.log("Starting race for party:", party.id);

      // Verify connection status before sending
      if (multiplayerConnection.isConnected) {
        console.log("WebSocket is connected, sending StartRace message");

        // Send WebSocket message to start the race
        multiplayerConnection.startRace();

        console.log("StartRace message sent");
      } else {
        console.warn("WebSocket not connected, attempting to connect first");
        multiplayerConnection.connect(userData.id, party.id);

        // Add a small delay to ensure connection is established
        setTimeout(() => {
          if (multiplayerConnection.isConnected) {
            console.log("WebSocket now connected, sending StartRace message");
            multiplayerConnection.startRace();
          } else {
            console.error("Failed to establish WebSocket connection");
            setError("Connection issue. Please try again.");
          }
        }, 1000);
      }

      // Also call the onStartRace callback
      if (onStartRace) {
        console.log("Calling onStartRace callback");
        // Include map data for both creator and joiner
        if (mapData) {
          // If we're the creator, include the mapData that was passed to this component
          const partyWithMapData = {
            ...party,
            mapData: mapData,
          };
          console.log("Starting race with map data:", mapData);
          onStartRace(partyWithMapData);
        } else if (partyMapData) {
          // If we have fetched map data, include it
          const partyWithMapData = {
            ...party,
            mapData: partyMapData,
          };
          console.log("Starting race with fetched map data:", partyMapData);
          onStartRace(partyWithMapData);
        } else {
          // Fallback to just the party
          onStartRace(party);
        }
      }
    } else {
      setError("Please create a party first");
    }
  };

  // Disband the party and cancel
  const handleDisband = async () => {
    if (!party) {
      if (onCancel) {
        onCancel();
      }
      return;
    }

    try {
      setIsLoading(true);

      // Use actual user data
      const userId = userData.id;
      if (!userId) {
        throw new Error("User data not available. Please try again.");
      }

      await fetchWithAuth(`/parties/${party.id}/disband`, {
        method: "POST",
        body: JSON.stringify({
          owner_id: userId,
        }),
      });

      if (onCancel) {
        onCancel();
      }
    } catch (err) {
      setError("Failed to disband party");
    } finally {
      setIsLoading(false);
    }
  };

  // Check if the current user is the owner of the party
  const isPartyOwner = party && userData.id === party.owner_id;

  return (
    <div className="w-screen h-screen bg-gradient-to-b from-[#1a1a3f] to-[#46628C] flex items-center justify-center relative overflow-hidden">
      {/* Background Canvas for 3D Globe */}
      {/* <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas
          className="w-full h-full"
          camera={{ position: [0, 0, 4], fov: 35 }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 3, 5]} intensity={1.2} />
          <GlobeModel scale={0.7} position={[0, -0.8, 0]} />
          <OrbitControls enableZoom={false} enablePan={false} autoRotate />
          <Environment preset="sunset" />
        </Canvas>
      </div> */}

      {/* Main UI content */}
      <div className="z-10 text-center p-6 bg-black bg-opacity-50 rounded-2xl backdrop-blur-md max-w-xl w-full">
        <img
          src={logo}
          alt="World Racing"
          className="mx-auto w-[200px] sm:w-[240px] drop-shadow-xl mb-6"
        />

        {error && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-white text-2xl font-bold mb-2">Race Room</h2>
          {userData?.name && (
            <p className="text-gray-300 mb-2">Welcome, {userData.name}</p>
          )}
          {(mapData || partyMapData) && (
            <p className="text-blue-300 mb-4">
              Map: {(mapData || partyMapData)?.title || "Custom Map"}
            </p>
          )}

          {!party ? (
            <div className="my-8">
              <p className="text-white mb-4">
                Create a party to invite friends to your race!
              </p>
              <button
                onClick={createParty}
                disabled={isCreatingParty || !userData.id}
                className={`px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg transition ${
                  isCreatingParty || !userData.id
                    ? "opacity-70 cursor-not-allowed"
                    : ""
                }`}
              >
                {isCreatingParty ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                    Creating Party...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Create Party
                  </div>
                )}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-gray-300 mb-2">
                Share this code with your friends:
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="bg-gray-800 px-6 py-3 rounded-lg text-white text-3xl font-mono tracking-wider">
                  {party.code}
                </div>
                <button
                  onClick={copyCodeToClipboard}
                  className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg text-white"
                >
                  {copySuccess ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-6 h-6 text-green-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.5 3A1.501 1.501 0 0 0 9 4.5h6A1.5 1.5 0 0 0 13.5 3h-3Zm-2.693.178A3 3 0 0 1 10.5 1.5h3a3 3 0 0 1 2.694 1.678c.497.042.992.092 1.486.15 1.497.173 2.57 1.46 2.57 2.929V19.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.257c0-1.47 1.073-2.756 2.57-2.93.493-.057.989-.107 1.487-.15Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {party && (
          <div className="mb-8">
            <h3 className="text-white text-xl font-semibold mb-4">
              Players in Lobby
            </h3>
            <div className="max-h-48 overflow-y-auto bg-gray-800 bg-opacity-50 rounded-lg p-2">
              {members.length > 0 ? (
                <ul className="divide-y divide-gray-700">
                  {members.map((member, index) => (
                    <li
                      key={index}
                      className="py-3 flex items-center justify-between"
                    >
                      <span className="text-white font-medium">
                        {member.name}
                        {member.id === userData.id && " (You)"}
                      </span>
                      {member.is_owner && (
                        <span className="bg-blue-600 text-xs px-2 py-1 rounded text-white">
                          Host
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 py-4 text-center">
                  Waiting for players to join...
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-4 justify-center">
          {/* Only show disband/cancel button if not a joiner or if there's no party yet */}
          {(!isJoiner || !party) && (
            <button
              onClick={handleDisband}
              className={`px-6 py-3 ${
                isLoading ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"
              } text-white font-semibold rounded-xl shadow-lg transition`}
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : party ? "Disband Party" : "Cancel"}
            </button>
          )}

          {/* Only show leave button for joiners */}
          {isJoiner && party && (
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-xl shadow-lg transition"
            >
              Leave Party
            </button>
          )}

          {party && (isPartyOwner || !party.owner_id) && !isJoiner && (
            <button
              onClick={handleStartRace}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-lg transition flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                  clipRule="evenodd"
                />
              </svg>
              Start Race
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
