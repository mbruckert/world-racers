import { useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";
import { fetchWithAuth, getUserData, fetchUserData } from "../utils/auth";
import multiplayerConnection from "../utils/websocket";

export default function RoomScreen({ mapData, onStartRace, onCancel }) {
  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingParty, setIsCreatingParty] = useState(false);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [userData, setUserData] = useState(getUserData());
  const [isConnectedToWs, setIsConnectedToWs] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  // Check if we already have a party from URL params or local storage
  useEffect(() => {
    const checkExistingParty = async () => {
      // Skip if we already have a party
      if (party || isJoined) return;

      // Check URL for party ID
      const urlParams = new URLSearchParams(window.location.search);
      const partyCode = urlParams.get("code");

      if (partyCode && userData.id) {
        try {
          setIsLoading(true);
          console.log("Attempting to join party from URL parameter");

          // Join the party from URL
          const response = await fetchWithAuth(`/parties/join`, {
            method: "POST",
            body: JSON.stringify({
              user_id: userData.id,
              code: partyCode,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            setParty(data);
            setIsJoined(true);

            // Clear the URL parameter after joining
            const url = new URL(window.location);
            url.searchParams.delete("code");
            window.history.pushState({}, "", url);
          }
        } catch (err) {
          console.error("Error joining party from URL:", err);
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkExistingParty();
  }, [userData.id, party, isJoined]);

  // Set up WebSocket handlers for the room
  useEffect(() => {
    // Set up WebSocket race start handler
    multiplayerConnection.onRaceStart = () => {
      console.log("Race starting from WebSocket event!");
      if (onStartRace && party) {
        // Force navigation to race even for non-owners
        console.log("Forcing race start from WebSocket event");

        // Give a brief moment to ensure all clients receive the message
        setTimeout(() => {
          try {
            console.log("Executing onStartRace callback with party:", party);
            onStartRace(party);
          } catch (error) {
            console.error("Error in onStartRace callback:", error);

            // As a last resort, dispatch a custom event
            window.dispatchEvent(
              new CustomEvent("race_started", {
                detail: { timestamp: new Date().toISOString(), party },
              })
            );
          }
        }, 500);
      }
    };

    // Also set up a listener for the custom event as a fallback
    const handleRaceStarted = (event) => {
      console.log("RoomScreen received race_started custom event");
      if (onStartRace && party) {
        try {
          onStartRace(party);
        } catch (error) {
          console.error("Error in fallback race start handler:", error);
        }
      }
    };

    window.addEventListener("race_started", handleRaceStarted);

    // Set up handler for new party members
    multiplayerConnection.onNewPartyMember = (data) => {
      console.log("New party member joined:", data);
      // Update the members list immediately instead of waiting for polling
      setMembers((prevMembers) => {
        // Check if member is already in the list
        if (!prevMembers.some((member) => member.id === data.user_id)) {
          return [
            ...prevMembers,
            {
              id: data.user_id,
              name: data.name,
              is_owner: false, // Assume not owner since they're joining
            },
          ];
        }
        return prevMembers;
      });
    };

    // Clean up handler on unmount
    return () => {
      multiplayerConnection.onRaceStart = null;
      multiplayerConnection.onNewPartyMember = null;
      window.removeEventListener("race_started", handleRaceStarted);
    };
  }, [onStartRace, party]);

  // Connect to WebSocket when we have a party
  useEffect(() => {
    if (!party || !userData.id || isConnectedToWs) return;

    console.log("Connecting to WebSocket in RoomScreen with:", {
      userId: userData.id,
      partyId: party.id,
      partyObject: party,
    });

    // Connect to WebSocket for real-time updates
    multiplayerConnection.connect(userData.id, party.id);
    setIsConnectedToWs(true);

    // Set initial party members
    if (members.length > 0) {
      members.forEach((member) => {
        multiplayerConnection.partyMembers.set(member.id, member.name);
      });
    }

    // Add current user to party members if not already there
    if (userData.id && userData.name) {
      multiplayerConnection.partyMembers.set(userData.id, userData.name);
    }

    return () => {
      // Don't disconnect here - we want to maintain the connection for the race
      // It will be cleaned up when the user leaves the race or the app
    };
  }, [party, userData.id, isConnectedToWs, members]);

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

  // Only set up polling for members when we have a party
  useEffect(() => {
    if (!party || !isJoined) return;

    let isMounted = true;
    const fetchMembers = async () => {
      try {
        // Skip if component is unmounting or no longer mounted
        if (!isMounted) return;

        const response = await fetchWithAuth(`/parties/${party.id}/members`);
        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            setMembers(data);

            // Update the party members in the WebSocket connection too
            if (isConnectedToWs) {
              data.forEach((member) => {
                multiplayerConnection.partyMembers.set(member.id, member.name);
              });
            }
          }
        }
      } catch (err) {
        console.error("Error fetching party members:", err);
      }
    };

    // Initial fetch
    fetchMembers();

    // Set up polling interval - use a reasonable interval (10 seconds)
    const interval = setInterval(fetchMembers, 10000);

    // Clean up interval on unmount
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [party, isJoined, isConnectedToWs]);

  // Start the race
  const handleStartRace = () => {
    if (onStartRace && party) {
      // Send race start message to all connected players
      if (multiplayerConnection.isConnected) {
        console.log("Sending StartRace WebSocket message");

        // Make sure the connection is truly established
        if (
          multiplayerConnection.ws &&
          multiplayerConnection.ws.readyState === WebSocket.OPEN
        ) {
          // Send the start race message
          multiplayerConnection.startRace();

          console.log("StartRace message sent successfully");

          // Give the message a moment to propagate before navigating
          setTimeout(() => {
            console.log("Starting race after WebSocket message sent");
            onStartRace(party);
          }, 800); // Longer timeout to ensure message propagation
        } else {
          console.warn(
            "WebSocket not in OPEN state, starting race without websocket"
          );
          onStartRace(party);
        }
      } else {
        console.warn(
          "WebSocket not connected, starting race without multiplayer sync"
        );
        onStartRace(party);
      }
    } else if (!party) {
      setError("Please create a party first");
    }
  };

  // Create a party
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
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create party");
      }

      const data = await response.json();
      setParty(data);
      setIsJoined(true);
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
    <div className="w-screen h-screen bg-gradient-to-b from-[#0f0f2e] to-[#1a1a3f] flex items-center justify-center relative overflow-hidden">
      {/* Background Canvas for 3D Globe */}
      <div className="absolute inset-0 z-0 pointer-events-none">
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
      </div>

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
          {mapData && (
            <p className="text-blue-300 mb-4">
              Map: {mapData.title || "Custom Map"}
            </p>
          )}

          {!isJoined ? (
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
                  {party?.code}
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
          <button
            onClick={handleDisband}
            className={`px-6 py-3 ${
              isLoading ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"
            } text-white font-semibold rounded-xl shadow-lg transition`}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : party ? "Disband Party" : "Cancel"}
          </button>

          {party && (isPartyOwner || !party.owner_id) && (
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
