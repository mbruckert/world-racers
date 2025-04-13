import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";
import { useEffect } from "react";

import { fetchWithAuth, getUserData } from "../utils/auth";
import multiplayerConnection from "../utils/websocket";

export default function StartScreen({
  handleBypass,
  handleCreateGame,
  handleJoinGame,
}) {
  const [partyCode, setPartyCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [userData] = useState(getUserData());

  const handleJoinClick = async () => {
    if (!partyCode.trim()) {
      setError("Please enter a party code");
      return;
    }

    try {
      setIsJoining(true);
      setError("");

      // Join directly using the party code
      const response = await fetchWithAuth(`/parties/join`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userData.id,
          code: partyCode.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Invalid party code. Please check and try again.");
      }

      const joinedPartyData = await response.json();

      multiplayerConnection.connect(userData.id, joinedPartyData.id);

      // Add isJoiner flag to party data
      joinedPartyData.isJoiner = true;

      // Call the handleJoinGame function with the joined party data
      if (handleJoinGame) {
        handleJoinGame(joinedPartyData);
      }
    } catch (err) {
      setError(err.message || "Failed to join party. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleJoinClick();
    }
  };

  // Washington DC demo map data
  const dcMapData = {
    author_id: 16,
    title: "Washington DC 2",
    description: "A race in Washington",
    start_latitude: 38.892631834527975,
    start_longitude: -77.03660918554066,
    end_latitude: 38.897425244477745,
    end_longitude: -77.03658837865198,
    checkpoints: [
      {
        latitude: 38.89279377933346,
        longitude: -77.03567287553109,
        position: 1,
      },
      {
        latitude: 38.89324722282504,
        longitude: -77.03490302063344,
        position: 2,
      },
      {
        latitude: 38.89420268356227,
        longitude: -77.03465333796434,
        position: 3,
      },
      {
        latitude: 38.89491522218546,
        longitude: -77.03527754463792,
        position: 4,
      },
      {
        latitude: 38.895174325366696,
        longitude: -77.03654676487378,
        position: 5,
      },
      {
        latitude: 38.896194534954844,
        longitude: -77.03509028263568,
        position: 6,
      },
      {
        latitude: 38.89680989238235,
        longitude: -77.03575610308745,
        position: 7,
      },
      {
        latitude: 38.8973604708242,
        longitude: -77.0361930477588,
        position: 8,
      },
    ],
  };

  const handleDemoRace = () => {
    if (handleJoinGame) {
      // Create a mock party object with the DC map data
      const demoParty = {
        id: "demo-dc",
        name: "Washington DC Demo",
        map_id: "dc-demo",
        isGuestMode: true, // Special flag for guest mode
        // Add any other required party properties
      };

      // Pass both the party and map data via the join handler
      handleJoinGame({
        ...demoParty,
        mapData: dcMapData,
      });
    }
  };

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@h0rn0chse/night-sky/dist/bundle.min.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div
      className="w-screen h-screen  flex items-center justify-center relative overflow-hidden"
      style={{
        background: `radial-gradient(circle at center,rgb(69, 120, 135) 0%,rgb(57, 91, 141) 20%, #1A1A3F 100%)`,
      }}
    >
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
        <night-sky
          id="nightSky"
          layers="3"
          density="40"
          velocity-x="10"
          velocity-y="10"
          star-color="#FFF"
          background-color="transparent"
          className="absolute inset-0 z-[-1] pointer-events-none"
        ></night-sky>
      </div>

      {/* Main UI content */}
      <div className="z-10 text-center">
        <img
          src={logo}
          alt="World Racing"
          className="mx-auto w-[280px] sm:w-[360px] drop-shadow-xl"
        />

        {/* Wrap input + button + second button in a shared container */}
        <div className="w-[300px] mx-auto mt-6">
          <h2 className="text-white text-lg font-semibold mb-2">Join Game</h2>

          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="bg-white bg-opacity-80 px-4 py-3 rounded-xl flex items-center shadow-md space-x-2">
            <input
              type="text"
              placeholder="Enter Code"
              value={partyCode}
              onChange={(e) => setPartyCode(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-grow px-3 py-2 rounded-lg bg-white text-black font-semibold focus:outline-none"
              disabled={isJoining}
            />
            <button
              className={`bg-blue-800 hover:bg-blue-700 text-white p-2 rounded-lg transition ${
                isJoining ? "opacity-70" : ""
              }`}
              onClick={handleJoinClick}
              disabled={isJoining}
            >
              {isJoining ? (
                <svg
                  className="animate-spin h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </div>

          <button
            className="mt-6 w-full bg-blue-800 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition"
            onClick={handleCreateGame}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
            >
              <path
                fillRule="evenodd"
                d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
                clipRule="evenodd"
              />
            </svg>
            Create New Game
          </button>

          {/* Demo Race Button */}
          <button
            className="mt-4 w-full bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white font-semibold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition"
            onClick={handleDemoRace}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6"
            >
              <path
                fillRule="evenodd"
                d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                clipRule="evenodd"
              />
            </svg>
            Demo Race: Washington DC
          </button>

          {userData?.name && (
            <p className="text-white text-sm mt-6">
              Logged in as {userData.name} &nbsp;{" "}
              <span
                className="underline cursor-pointer"
                onClick={() => {
                  localStorage.removeItem("worldracers_auth");
                  localStorage.removeItem("worldracers_users");
                  window.location.reload();
                }}
              >
                Sign Out
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
