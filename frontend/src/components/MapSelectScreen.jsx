import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fetchWithAuth } from "../utils/auth";

export default function MapSelectScreen({ onCreateNew, onSelectMap }) {
  const [maps, setMaps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFetched, setIsFetched] = useState(false);

  useEffect(() => {
    // Only fetch maps once when the component mounts
    if (!isFetched) {
      fetchMaps();
    }
  }, [isFetched]);

  const fetchMaps = async () => {
    if (isFetched) return;

    try {
      setIsLoading(true);
      setError("");

      const response = await fetchWithAuth("/maps");

      if (!response.ok) {
        throw new Error("Failed to fetch maps");
      }

      const mapsData = await response.json();
      setMaps(mapsData);
      setIsFetched(true);
    } catch (err) {
      setError(err.message || "Failed to load maps. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setIsFetched(false);
    fetchMaps();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f2e] to-[#1a1a3f] py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Select a Map</h1>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-1"></div>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            )}
            Refresh
          </button>
        </div>

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
