import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchWithAuth, getUserData, fetchUserData } from "../utils/auth";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function MapBuilderExtended({ onRouteSubmit }) {
  const mapRef = useRef(null);
  const modeRef = useRef(null);

  const [address, setAddress] = useState("");
  const [locationName, setLocationName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [error, setError] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [weather, setWeather] = useState("clear");
  const [isSaving, setIsSaving] = useState(false);
  const [userData, setUserData] = useState(getUserData());

  const startMarker = useRef(null);
  const endMarker = useRef(null);
  const checkpointMarkers = useRef([]);

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

  // Calculate distance between two coordinates in miles using Haversine formula
  const calculateDistance = (coord1, coord2) => {
    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const R = 3958.8; // Earth's radius in miles
    const dLat = toRadians(coord2[1] - coord1[1]);
    const dLon = toRadians(coord2[0] - coord1[0]);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(coord1[1])) *
        Math.cos(toRadians(coord2[1])) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: [280, 10],
      zoom: 1,
    });

    mapRef.current = map;

    map.on("click", (e) => {
      const mode = modeRef.current;
      if (!mode) return;

      const lngLat = [e.lngLat.lng, e.lngLat.lat];

      if (mode === "start") {
        if (startMarker.current) startMarker.current.remove();

        const marker = new mapboxgl.Marker({ color: "green" })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup().setText("Start Point"))
          .addTo(map);

        startMarker.current = marker;
        setStart(lngLat);
        setError("");
      }

      if (mode === "end") {
        if (endMarker.current) endMarker.current.remove();

        const marker = new mapboxgl.Marker({ color: "red" })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup().setText("End Point"))
          .addTo(map);

        endMarker.current = marker;
        setEnd(lngLat);
        setError("");
      }

      if (mode === "checkpoint") {
        const marker = new mapboxgl.Marker({ color: "purple" })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup().setText("Checkpoint"))
          .addTo(map);

        checkpointMarkers.current.push(marker);
        setCheckpoints((prev) => [...prev, lngLat]);
      }
    });

    return () => map.remove();
  }, []);

  const handleAddressChange = (e) => {
    const newAddress = e.target.value;
    setAddress(newAddress);
    // Also update the location name as the user types
    if (newAddress) {
      setLocationName(newAddress);
    }
  };

  const handleGeocode = async () => {
    if (!address) return;

    const query = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxgl.accessToken}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        mapRef.current.flyTo({ center: [lng, lat], zoom: 15 });

        // Extract and store the location name
        const placeName = data.features[0].place_name;
        const mainLocation = placeName.split(",")[0];
        setLocationName(mainLocation);

        // Use location name as default title if title is empty
        if (!title) {
          setTitle(mainLocation);
        }
      } else {
        alert("Location not found.");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  const handleClearCheckpoints = () => {
    checkpointMarkers.current.forEach((m) => m.remove());
    checkpointMarkers.current = [];
    setCheckpoints([]);
  };

  const handleClearAll = () => {
    // Clear checkpoints
    checkpointMarkers.current.forEach((m) => m.remove());
    checkpointMarkers.current = [];
    setCheckpoints([]);

    // Clear start point
    if (startMarker.current) {
      startMarker.current.remove();
      startMarker.current = null;
    }
    setStart(null);

    // Clear end point
    if (endMarker.current) {
      endMarker.current.remove();
      endMarker.current = null;
    }
    setEnd(null);

    // Clear error message
    setError("");
  };

  const saveMapToApi = async () => {
    if (!start || !end) {
      setError("Please set both a start and end point.");
      return false;
    }

    if (!title.trim()) {
      setError("Please enter a title for your map.");
      return false;
    }

    if (!userData.id) {
      setError(
        "User data not available. Please refresh the page and try again."
      );
      return false;
    }

    // Check if distance exceeds 2 miles
    const distance = calculateDistance(start, end);
    if (distance > 2) {
      setError(
        `Distance between start and end points (${distance.toFixed(
          2
        )} miles) exceeds the 2 mile limit.`
      );
      return false;
    }

    try {
      setIsSaving(true);
      setError("");

      // Get author ID from user data
      const authorId = userData.id;

      // Format checkpoints for API
      const formattedCheckpoints = checkpoints.map((cp, index) => ({
        latitude: cp[1],
        longitude: cp[0],
        position: index + 1,
      }));

      const mapData = {
        author_id: authorId,
        title: title.trim(),
        description:
          description.trim() ||
          `A race in ${locationName || "unknown location"}`,
        start_latitude: start[1],
        start_longitude: start[0],
        end_latitude: end[1],
        end_longitude: end[0],
        checkpoints: formattedCheckpoints,
      };

      console.log(mapData);

      const response = await fetchWithAuth("/maps", {
        method: "POST",
        body: JSON.stringify(mapData),
      });

      if (!response.ok) {
        throw new Error("Failed to save map");
      }

      const savedMap = await response.json();
      console.log("Map saved successfully:", savedMap);
      return true;
    } catch (err) {
      setError(err.message || "Failed to save map. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    // Try to save the map first
    const saved = await saveMapToApi();

    if (saved) {
      try {
        // Fetch the most recently created map
        const response = await fetchWithAuth(
          `/maps?author_id=${userData.id}&limit=1&sort=created_at:desc`
        );
        if (!response.ok) {
          throw new Error("Could not retrieve saved map");
        }

        const maps = await response.json();
        if (maps.length > 0) {
          const savedMap = maps[0];

          // Proceed with the normal flow with complete map data
          onRouteSubmit({
            id: savedMap.id,
            title: savedMap.title,
            description: savedMap.description,
            start_longitude: start[0],
            start_latitude: start[1],
            end_longitude: end[0],
            end_latitude: end[1],
            startPosition: start,
            finishPosition: end,
            checkpoints: checkpoints,
            locationName: locationName || "Unknown Location",
            timeOfDay,
            weather,
          });
        } else {
          throw new Error("Saved map not found");
        }
      } catch (err) {
        setError(
          "Map was saved but couldn't be loaded for race. Please try again."
        );
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 bg-gray-900">
      {/* Address Search */}
      <div className="w-full max-w-6xl p-4 mb-4">
        <div
          className="flex items-center rounded-[16px] px-4 py-2 bg-white"
          style={{ boxShadow: "0 4px 8px rgba(59, 130, 246, 0.3)" }} // blue shadow
        >
          <input
            type="text"
            value={address}
            onChange={handleAddressChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGeocode();
              }
            }}
            placeholder="Search for a location"
            className="flex-1 outline-none bg-transparent text-gray-600 placeholder:text-gray-400"
          />
          <button
            onClick={handleGeocode}
            className="ml-2 text-gray-600 text-xl"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
            >
              <path
                fillRule="evenodd"
                d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex w-full max-w-6xl gap-4">
        <div className="flex-1">
          {/* Map */}
          <div className="w-full h-[450px] rounded-xl overflow-hidden shadow-lg border border-gray-300 mb-4">
            <div id="map" className="w-full h-full" />
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-600 text-white rounded-lg">
              {error}
            </div>
          )}

          {/* Map Info Form */}
          <div className="mt-4 p-4 bg-gray-800 rounded-xl">
            <h3 className="text-xl font-semibold text-white mb-4">
              Map Details
            </h3>

            {userData?.name && (
              <p className="text-gray-300 mb-4">Creator: {userData.name}</p>
            )}

            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter map title"
                className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter map description"
                className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              />
            </div>
          </div>
        </div>

        <div className="w-[300px] flex flex-col gap-4">
          {/* Mode Select */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-xl font-semibold text-white mb-4">
              Place Points
            </h3>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => (modeRef.current = "start")}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition flex items-center gap-2"
              >
                <div className="h-3 w-3 rounded-full bg-white"></div>
                Set Start Point
              </button>

              <button
                onClick={() => (modeRef.current = "end")}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition flex items-center gap-2"
              >
                <div className="h-3 w-3 rounded-full bg-white"></div>
                Set End Point
              </button>

              <button
                onClick={() => (modeRef.current = "checkpoint")}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition flex items-center gap-2"
              >
                <div className="h-3 w-3 rounded-full bg-white"></div>
                Add Checkpoint
              </button>

              <button
                onClick={handleClearCheckpoints}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition mt-2"
              >
                Clear Checkpoints
              </button>

              <button
                onClick={handleClearAll}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Environment */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-xl font-semibold text-white mb-4">
              Environment
            </h3>

            <div className="mb-4">
              <label className="block text-white mb-2">Time of Day</label>
              <select
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none"
              >
                <option value="dawn">Dawn</option>
                <option value="day">Day</option>
                <option value="dusk">Dusk</option>
                <option value="night">Night</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-white mb-2">Weather</label>
              <select
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none"
              >
                <option value="clear">Clear</option>
                <option value="snow">Snow</option>
                <option value="rain">Rainy</option>
                <option value="fog">Foggy</option>
              </select>
            </div>
          </div>

          {/* Create Race Button */}
          <div className="mt-auto">
            <button
              onClick={handleSubmit}
              disabled={isSaving || !userData.id}
              className={`w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 ${
                isSaving || !userData.id ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {isSaving ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Saving...
                </>
              ) : (
                <>
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
                      d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                    />
                  </svg>
                  Create Race
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
