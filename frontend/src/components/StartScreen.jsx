// import worldImage from "../assets/world.png"; // Adjust path as needed

export default function StartScreen() {
  return (
    <div className="w-screen h-screen bg-gradient-to-b from-[#0f0f2e] to-[#1a1a3f] flex items-center justify-center relative overflow-hidden">
      {/* Background globe image */}
      {/* <img
        src={worldImage}
        alt="World Globe"
        className="absolute top-1/2 left-1/2 w-[300px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 z-0 opacity-90"
      /> */}

      {/* Main UI content */}
      <div className="z-10 text-center">
        {/* Title */}
        <h1 className="text-white text-4xl sm:text-5xl font-extrabold drop-shadow-md">
          <span className="text-green-400">WORLD</span>{" "}
          <span className="text-blue-400">RACING</span>
        </h1>

        {/* Join Game Section */}
        <div className="mt-6">
          <h2 className="text-white text-lg font-semibold mb-2">Join Game</h2>
          <div className="bg-white bg-opacity-80 px-4 py-3 rounded-xl flex items-center shadow-md w-[300px] mx-auto space-x-2">
            <input
              type="text"
              placeholder="Enter Code"
              defaultValue="XRP-M39"
              className="flex-grow px-3 py-2 rounded-lg bg-white text-black font-semibold focus:outline-none"
            />
            <button className="bg-blue-800 hover:bg-blue-700 text-white p-2 rounded-lg transition">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
               <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>

            </button>
          </div>
        </div>

        {/* Create New Game Button */}
        <button className="mt-6 bg-blue-800 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg flex items-center justify-center gap-2 transition">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-6">
            <path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
         </svg>

          Create New Game
        </button>
      </div>
    </div>
  );
}
