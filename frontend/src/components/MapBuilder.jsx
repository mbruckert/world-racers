import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function MapBuilder({ onRouteSubmit }) {
  const mapRef = useRef(null);
  const modeRef = useRef(null);

  const [address, setAddress] = useState("");
  const [locationName, setLocationName] = useState("");
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [error, setError] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [weather, setWeather] = useState("clear");

  const startMarker = useRef(null);
  const endMarker = useRef(null);
  const checkpointMarkers = useRef([]);

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

  const handleSubmit = () => {
    if (!start || !end) {
      setError("Please set both a start and end point.");
      return;
    }

    // Check if distance exceeds 2 miles
    const distance = calculateDistance(start, end);
    if (distance > 2) {
      setError(
        `Distance between start and end points (${distance.toFixed(
          2
        )} miles) exceeds the 2 mile limit.`
      );
      return;
    }

    console.log("Submitting race route with:");
    console.log("Start:", start);
    console.log("Finish:", end);
    console.log("Checkpoints:", checkpoints);
    console.log("Location:", locationName);
    console.log("Time of Day:", timeOfDay);
    console.log("Weather:", weather);

    // Pass the positions with explicit named parameters
    onRouteSubmit({
      startPosition: start,
      finishPosition: end,
      checkpoints: checkpoints,
      locationName: locationName || "Unknown Location",
      timeOfDay,
      weather,
    });
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
          {error && <div className="mt-4 text-red-600">{error}</div>}

          {/* Map Controls */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => (modeRef.current = "start")}
              className="w-12 h-12 rounded-[16px] bg-white flex items-center justify-center text-green-500"
              style={{ boxShadow: "0 4px 8px rgba(34, 197, 94, 0.4)" }} // green shadow
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={() => (modeRef.current = "end")}
              className="w-12 h-12 rounded-[16px] bg-white flex items-center justify-center text-red-500"
              style={{ boxShadow: "0 4px 8px rgba(239, 68, 68, 0.4)" }} // red shadow
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={() => (modeRef.current = "checkpoint")}
              className="w-12 h-12 rounded-[16px] bg-white flex items-center justify-center text-purple-500"
              style={{ boxShadow: "0 4px 8px rgba(168, 85, 247, 0.4)" }} // purple shadow
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={handleClearCheckpoints}
              className="px-4 rounded-[16px] bg-white flex items-center justify-center text-gray-500"
              style={{ boxShadow: "0 4px 8px rgba(161, 161, 161, 0.4)" }} // blue shadow
            >
              <span className="mr-2">Clear</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 rounded-[16px] bg-white flex items-center justify-center text-blue-500"
              style={{ boxShadow: "0 4px 8px rgba(59, 130, 246, 0.4)" }} // blue shadow
            >
              <span className="mr-2">Start Race</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Weather and Time Settings (Right Side) */}
        <div className="w-64 bg-gray-800 rounded-xl p-4 border border-gray-700 h-min">
          <h3 className="text-white font-semibold mb-3 text-center">
            Race Settings
          </h3>
          <p className="text-gray-400 text-xs mb-4 text-center">
            These settings will be applied when you start the race.
          </p>

          {/* Time of Day Selection */}
          <div className="mb-4">
            <label className="block text-gray-300 mb-2 font-medium">
              Time of Day
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "dawn", label: "Dawn", icon: "🌅" },
                { value: "day", label: "Day", icon: "🌞" },
                { value: "dusk", label: "Dusk", icon: "🌆" },
                { value: "night", label: "Night", icon: "🌙" },
              ].map((time) => (
                <button
                  key={time.value}
                  onClick={() => setTimeOfDay(time.value)}
                  className={`py-2 flex flex-col items-center justify-center rounded-lg transition-all ${
                    timeOfDay === time.value
                      ? "bg-indigo-600 text-white shadow-lg scale-105"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span className="text-lg mb-1">{time.icon}</span>
                  <span className="text-xs">{time.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Weather Selection */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium">
              Weather
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "clear", label: "Clear", icon: "☀️" },
                { value: "rain", label: "Rain", icon: "🌧️" },
                { value: "snow", label: "Snow", icon: "❄️" },
              ].map((weatherType) => (
                <button
                  key={weatherType.value}
                  onClick={() => setWeather(weatherType.value)}
                  className={`py-2 flex flex-col items-center justify-center rounded-lg transition-all ${
                    weather === weatherType.value
                      ? "bg-indigo-600 text-white shadow-lg scale-105"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span className="text-lg mb-1">{weatherType.icon}</span>
                  <span className="text-xs">{weatherType.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
