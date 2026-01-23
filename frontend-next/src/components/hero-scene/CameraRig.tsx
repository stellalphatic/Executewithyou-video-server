'use client';


import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from './utils/hooks';

interface CameraRigProps {
  shapesRef: React.RefObject<THREE.Object3D>;
  streamsRef: React.RefObject<THREE.Object3D>;
  dustRef: any;
  sectionIndex: number;
}

const CAMERA_SHOTS = [
  // 0: Hero - Front and center, slightly low angle
  { x: 0, y: 0, z: 22, rx: 0, ry: 0, rz: 0 },
  
  // 1: Infra - Orbit Right
  { x: 15, y: 0, z: 15, rx: 0, ry: 0.8, rz: 0 },
  
  // 2: Studio - Orbit Left
  { x: -15, y: 5, z: 15, rx: -0.2, ry: -0.8, rz: 0 },
  
  // 3: Collab - Top Down
  { x: 0, y: 18, z: 5, rx: -1.2, ry: 0, rz: 0 },
  
  // 4: AI - Close Up
  { x: 0, y: 0, z: 14, rx: 0, ry: 0, rz: 0.2 },
  
  // 5: API - Low Angle
  { x: 10, y: -10, z: 15, rx: 0.5, ry: 0.5, rz: 0 },
  
  // 6: CTA - Pull Back
  { x: 0, y: 0, z: 30, rx: 0, ry: 0, rz: 0 },
];

export const CameraRig: React.FC<CameraRigProps> = ({ sectionIndex }) => {
  const { camera } = useThree();
  const prefersReducedMotion = useReducedMotion();
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  
  const camParams = useRef({ ...CAMERA_SHOTS[0] });

  useFrame((state, delta) => {
    // Clamp index
    const safeIndex = Math.min(Math.max(sectionIndex, 0), CAMERA_SHOTS.length - 1);
    const target = CAMERA_SHOTS[safeIndex];

    const smoothFactor = prefersReducedMotion ? 10 * delta : 1.5 * delta;

    // Interpolate Params
    camParams.current.x = THREE.MathUtils.lerp(camParams.current.x, target.x, smoothFactor);
    camParams.current.y = THREE.MathUtils.lerp(camParams.current.y, target.y, smoothFactor);
    camParams.current.z = THREE.MathUtils.lerp(camParams.current.z, target.z, smoothFactor);
    camParams.current.rx = THREE.MathUtils.lerp(camParams.current.rx, target.rx, smoothFactor);
    camParams.current.ry = THREE.MathUtils.lerp(camParams.current.ry, target.ry, smoothFactor);
    camParams.current.rz = THREE.MathUtils.lerp(camParams.current.rz, target.rz, smoothFactor);

    // Subtle breathing motion
    const time = state.clock.getElapsedTime();
    const driftX = Math.sin(time * 0.1) * 0.5;
    const driftY = Math.cos(time * 0.1) * 0.5;

    targetVec.set(camParams.current.x + driftX, camParams.current.y + driftY, camParams.current.z);
    
    camera.position.copy(targetVec);
    camera.rotation.set(camParams.current.rx, camParams.current.ry, camParams.current.rz);
  });

  return null;
};
