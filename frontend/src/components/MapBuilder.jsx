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

    // Pass the positions with explicit named parameters
    onRouteSubmit({
      startPosition: start,
      finishPosition: end,
      checkpoints: checkpoints,
      locationName: locationName || "Unknown Location",
    });
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 bg-indigo-100">
      {/* Address Search */}
      <div className="w-full max-w-xl p-4 mb-4">
        <div
          className="flex items-center rounded-[16px] px-4 py-2 bg-white"
          style={{ boxShadow: "0 4px 8px rgba(59, 130, 246, 0.3)" }} // blue shadow
        >
          <input
            type="text"
            value={address}
            onChange={handleAddressChange}
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

      {/* Map */}
      <div className="w-full max-w-xl h-[450px] rounded-xl overflow-hidden shadow-lg border border-gray-300">
        <div id="map" className="w-full h-full" />
      </div>

      {/* Error message */}
      {error && <div className="mt-4 text-red-600">{error}</div>}

      {/* Controls */}
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
          className="w-12 h-12 rounded-[16px] bg-white flex items-center justify-center text-gray-500"
          style={{ boxShadow: "0 4px 8px rgba(107, 114, 128, 0.3)" }} // gray shadow
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={3}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
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
            fill="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
