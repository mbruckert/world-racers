import React, { useRef } from "react";
import { useGLTF, Text } from "@react-three/drei";
import * as THREE from "three";

// A simple color hash function to generate consistent colors for each player
const hashStringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Create a vibrant color by setting one component to max
  const r = Math.abs((hash & 0xff0000) >> 16) / 255;
  const g = Math.abs((hash & 0x00ff00) >> 8) / 255;
  const b = Math.abs(hash & 0x0000ff) / 255;

  // Make sure at least one component is high to avoid dark colors
  const max = Math.max(r, g, b);
  const factor = 0.8 / max;

  return new THREE.Color(
    Math.min(1, r * factor),
    Math.min(1, g * factor),
    Math.min(1, b * factor)
  );
};

export function MultiplayerVehicle({
  playerId,
  position,
  rotation,
  playerName,
}) {
  const group = useRef();
  const { nodes, materials } = useGLTF("/assets/models/vehicle.glb");

  // Generate a consistent color based on player ID
  const carColor = hashStringToColor(playerId);

  // Convert rotation from server format to three.js Euler angles
  const eulerRotation = new THREE.Euler(
    rotation.pitch * (Math.PI / 180), // pitch (X axis)
    rotation.yaw * (Math.PI / 180), // yaw (Y axis)
    rotation.roll * (Math.PI / 180) // roll (Z axis)
  );

  return (
    <group
      ref={group}
      position={[position.x, position.y, position.z]}
      rotation={eulerRotation}
    >
      {/* Car model - simplified example, replace with actual model reference */}
      <mesh castShadow>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial color={carColor} />
      </mesh>

      {/* Player name above vehicle */}
      <group position={[0, 2, 0]}>
        <mesh>
          <planeGeometry args={[4, 1]} />
          <meshBasicMaterial color="black" transparent opacity={0.6} />
        </mesh>
        <Text
          position={[0, 0, 0.1]}
          color="white"
          fontSize={0.5}
          font="/assets/fonts/Inter-Bold.woff"
          anchorX="center"
          anchorY="middle"
        >
          {playerName}
        </Text>
      </group>
    </group>
  );
}

export default MultiplayerVehicle;
