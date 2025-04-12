import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API_KEY;

export default function MapBuilder() {
   const mapRef = useRef(null);
   const modeRef = useRef(null);

   const [address, setAddress] = useState('');
   const [start, setStart] = useState(null);
   const [end, setEnd] = useState(null);
   const [checkpoints, setCheckpoints] = useState([]);

   const startMarker = useRef(null);
   const endMarker = useRef(null);
   const checkpointMarkers = useRef([]);

   useEffect(() => {
      const map = new mapboxgl.Map({
         container: 'map',
         style: 'mapbox://styles/mapbox/streets-v12',
         center: [-74.5, 40],
         zoom: 9,
      });

      mapRef.current = map;

      map.on('click', (e) => {
         const mode = modeRef.current;
         if (!mode) return;

         const lngLat = [e.lngLat.lng, e.lngLat.lat];

         if (mode === 'start') {
            if (startMarker.current) startMarker.current.remove();

            const marker = new mapboxgl.Marker({ color: 'green' })
               .setLngLat(lngLat)
               .setPopup(new mapboxgl.Popup().setText('Start Point'))
               .addTo(map);

            startMarker.current = marker;
            setStart(lngLat);
         }

         if (mode === 'end') {
            if (endMarker.current) endMarker.current.remove();

            const marker = new mapboxgl.Marker({ color: 'red' })
               .setLngLat(lngLat)
               .setPopup(new mapboxgl.Popup().setText('End Point'))
               .addTo(map);

            endMarker.current = marker;
            setEnd(lngLat);
         }

         if (mode === 'checkpoint') {
            const marker = new mapboxgl.Marker({ color: 'purple' })
               .setLngLat(lngLat)
               .setPopup(new mapboxgl.Popup().setText('Checkpoint'))
               .addTo(map);

            checkpointMarkers.current.push(marker);
            setCheckpoints((prev) => [...prev, lngLat]);
         }
      });

      return () => map.remove();
   }, []);

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
         } else {
            alert('Location not found.');
         }
      } catch (error) {
            console.error('Geocoding error:', error);
      }
   };

   const handleClearCheckpoints = () => {
      checkpointMarkers.current.forEach((m) => m.remove());
      checkpointMarkers.current = [];
      setCheckpoints([]);
   };

   const handleSubmit = async () => {
      if (!start || !end) {
         alert('Please set both a start and end point.');
         return;
      }

      const body = {
         start,
         end,
         checkpoints,
      };

      console.log('Sending to backend:', body);

      try {
         const res = await fetch('http://localhost:8080/saveRoute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
         });

         const data = await res.json();
         console.log('Backend response:', data);
      } catch (err) {
         console.error('Error submitting route:', err);
      }
   };

   return (
      <div className="flex flex-col items-center justify-start min-h-screen p-4 bg-indigo-100">
      
      {/* Address Search */}
         <div className="w-full max-w-xl p-4 mb-4">
            <div className="flex items-center border border-slate-500 rounded-[16px] px-4 py-2 bg-white shadow-sm">
            <input
               type="text"
               value={address}
               onChange={(e) => setAddress(e.target.value)}
               placeholder="Search for a location"
               className="flex-1 outline-none bg-transparent text-blue-900 placeholder:text-blue-400"
            />
            <button onClick={handleGeocode} className="ml-2 text-blue-900 text-xl">🔍</button>
         </div>
      </div>

      {/* Map */}
      <div className="w-full max-w-xl h-[450px] rounded-xl overflow-hidden shadow-lg border border-gray-300">
         <div id="map" className="w-full h-full" />
      </div>

      {/* Controls */}
      <div className="flex gap-4 mt-4">
         <button
            onClick={() => (modeRef.current = 'start')}
            className="w-12 h-12 rounded-[16px] bg-white border-2 border-green-500 shadow-md flex items-center justify-center text-green-500"
         >
            🟢
         </button>
         <button
            onClick={() => (modeRef.current = 'end')}
            className="w-12 h-12 rounded-[16px] bg-white border-2 border-red-500 shadow-md flex items-center justify-center text-red-500"
         >
            🔴
         </button>
         <button
            onClick={() => (modeRef.current = 'checkpoint')}
            className="w-12 h-12 rounded-[16px] bg-white border-2 border-purple-500 shadow-md flex items-center justify-center text-purple-500"
         >
            ⚡
         </button>
         <button
            onClick={handleClearCheckpoints}
            className="w-12 h-12 rounded-[16px] bg-white border-2 border-gray-400 shadow-md flex items-center justify-center text-gray-500"
         >
            ❌
         </button>
         <button
            onClick={handleSubmit}
            className="w-12 h-12 rounded-[16px] bg-white border-2 border-blue-500 shadow-md flex items-center justify-center text-blue-500"
         >
            💾
         </button>
         </div>
      </div>
   );
}
