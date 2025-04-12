import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import MapBuilder from "./components/MapBuilder";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <MapBuilder />
    </>
  );
}

export default App;
