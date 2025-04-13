import { useState, useEffect } from "react";
import { format } from "date-fns";

export default function MapSelectScreen({ onCreateNew, onSelectMap }) {
  const [maps, setMaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMaps();
  }, []);

  const fetchMaps = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Get auth token from localStorage
      const authData = JSON.parse(
        localStorage.getItem("worldracers_auth") || "{}"
      );
      const token = authData.access_token;

      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(
        "https://worldracers.warrensnipes.dev/api/maps",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch maps");
      }

      const mapsData = await response.json();
      setMaps(mapsData);
    } catch (err) {
      setError(err.message || "Failed to load maps. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f2e] to-[#1a1a3f] py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          Select a Map
        </h1>

        {error && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center my-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
              {maps.length > 0 ? (
                maps.map((map) => (
                  <div
                    key={map.id}
                    onClick={() => onSelectMap(map)}
                    className="bg-white bg-opacity-10 backdrop-blur-md rounded-xl overflow-hidden cursor-pointer transition hover:transform hover:scale-105 hover:bg-opacity-20"
                  >
                    <div className="p-4">
                      <h3 className="text-xl font-semibold text-black mb-2 truncate">
                        {map.title}
                      </h3>
                      <p className="text-gray-300 mb-2 line-clamp-2 h-12">
                        {map.description || "No description available"}
                      </p>
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>{map.checkpoint_count} checkpoints</span>
                        <span>
                          {format(new Date(map.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-gray-300">
                  No maps available. Create your first map!
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg flex items-center justify-center gap-2 transition"
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
                Create New Map
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
