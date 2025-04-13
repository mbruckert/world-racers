import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";

export default function AuthScreen({ onAuthenticated }) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    try {
      setError("");
      setIsLoading(true);

      const response = await fetch(
        "https://worldracers.warrensnipes.dev/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: name.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error("Authentication failed");
      }

      const authData = await response.json();

      // Save auth data to localStorage
      localStorage.setItem("worldracers_auth", JSON.stringify(authData));

      // Notify parent component
      onAuthenticated(authData);
    } catch (err) {
      setError(err.message || "Failed to authenticate. Please try again.");
    } finally {
      setIsLoading(false);
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

        <div className="w-[300px] mx-auto mt-6">
          <h2 className="text-white text-lg font-semibold mb-2">
            Enter Your Name
          </h2>

          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="bg-white bg-opacity-80 px-4 py-3 rounded-xl flex items-center shadow-md space-x-2">
              <input
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
        </div>
      </div>
    </div>
  );
}
