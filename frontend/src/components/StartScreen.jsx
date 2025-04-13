import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import GlobeModel from "./GlobeModel";
import logo from "../assets/logo.png";

export default function StartScreen({ handleBypass, handleCreateGame }) {
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
      <div className="z-10 text-center">
        <img
          src={logo}
          alt="World Racing"
          className="mx-auto w-[280px] sm:w-[360px] drop-shadow-xl"
        />

        {/* Wrap input + button + second button in a shared container */}
        <div className="w-[300px] mx-auto mt-6">
          <h2 className="text-white text-lg font-semibold mb-2">Join Game</h2>
          <div className="bg-white bg-opacity-80 px-4 py-3 rounded-xl flex items-center shadow-md space-x-2">
            <input
              type="text"
              placeholder="Enter Code"
              className="flex-grow px-3 py-2 rounded-lg bg-white text-black font-semibold focus:outline-none"
            />
            <button
              className="bg-blue-800 hover:bg-blue-700 text-white p-2 rounded-lg transition"
              onClick={() => {}}
            >
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

          {handleBypass && (
            <button
              className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition"
              onClick={() => {
                handleBypass();
              }}
            >
              Bypass (Dev Only)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
