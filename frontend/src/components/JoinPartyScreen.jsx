import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";
import { fetchWithAuth, getAuthData } from "../utils/auth";

export default function JoinPartyScreen({ onJoined, onCancel }) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!code.trim()) {
      setError("Please enter a party code");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      // Use the join party endpoint
      const response = await fetchWithAuth(`/parties/join`, {
        method: "POST",
        body: JSON.stringify({
          code: code.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Invalid party code. Please check and try again.");
      }

      const joinedPartyData = await response.json();

      // Notify parent component
      if (onJoined) {
        onJoined(joinedPartyData);
      }
    } catch (err) {
      setError(err.message || "Failed to join party. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-gradient-to-b from-[#1a1a3f] to-[#46628C] flex items-center justify-center relative overflow-hidden">
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
      <div className="z-10 text-center">
        <img
          src={logo}
          alt="World Racing"
          className="mx-auto w-[280px] sm:w-[360px] drop-shadow-xl"
        />

        <div className="w-[300px] mx-auto mt-6">
          <h2 className="text-white text-lg font-semibold mb-2">Join Race</h2>

          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="bg-white bg-opacity-80 px-4 py-3 rounded-xl flex items-center shadow-md space-x-2">
              <input
                type="text"
                placeholder="Enter Party Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-grow px-3 py-2 rounded-lg bg-white text-black font-semibold focus:outline-none"
                disabled={isLoading}
              />
              <button
                type="submit"
                className={`bg-blue-800 hover:bg-blue-700 text-white p-2 rounded-lg transition ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
                disabled={isLoading}
              >
                {isLoading ? (
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
          </form>

          <button
            onClick={onCancel}
            className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl shadow-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
