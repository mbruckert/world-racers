// components/GlobeModel.jsx
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import React from 'react';

export default function GlobeModel(props) {
  const gltf = useLoader(GLTFLoader, '/models/low_poly_planet_earth.glb');
  return <primitive object={gltf.scene} {...props} />;
}
