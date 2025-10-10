import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  OrbitControls, 
  Environment, 
  ContactShadows,
  RoundedBox,
  Sphere,
  Cylinder,
  Html,
  MeshReflectorMaterial,
  Torus,
  Box
} from '@react-three/drei';
import * as THREE from 'three';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import './UltraRobotMascot.css';

interface UltraRobotProps {
  mousePosition: { x: number; y: number };
  onNameSubmit?: (name: string) => void;
  isCelebrating?: boolean;
  scaleFactor?: number;
}

// Floating Social Media Icons Component with REAL SVG LOGOS
function FloatingSocialIcons({ headPosition, scaleFactor = 1 }: { headPosition: [number, number, number]; scaleFactor?: number }) {
  const iconsRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (iconsRef.current) {
      iconsRef.current.rotation.z = state.clock.elapsedTime * 0.2;
    }
  });

  const socialIcons = [
    { name: 'instagram', icon: '/icons/instagram.svg', color: '#E4405F' },
    { name: 'facebook', icon: '/icons/facebook.svg', color: '#1877F2' },
    { name: 'twitter', icon: '/icons/twitter.svg', color: '#1DA1F2' },
    { name: 'linkedin', icon: '/icons/linkedin.svg', color: '#0A66C2' },
    { name: 'youtube', icon: '/icons/youtube.svg', color: '#FF0000' },
    { name: 'tiktok', icon: '/icons/tiktok.svg', color: '#00F2EA' },
  ];

  return (
    <group ref={iconsRef} position={[headPosition[0], headPosition[1], headPosition[2] + 0.75]}>
      {socialIcons.map((icon, index) => {
        const angle = (index / socialIcons.length) * Math.PI * 2;
        const radius = 0.4;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        // Random floating animation
        const floatOffset = Math.sin(index * 2 + Date.now() * 0.001) * 0.05;
        
        return (
          <Html
            key={icon.name}
            position={[x, y + floatOffset, 0.1]}
            center
            distanceFactor={0.8 * scaleFactor}
            transform
            sprite
          >
            <div 
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${icon.color}, ${icon.color}dd)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 20px ${icon.color}88, inset 0 0 10px rgba(255,255,255,0.3)`,
                border: '3px solid rgba(255,255,255,0.5)',
                animation: 'pulse 2s ease-in-out infinite',
                backdropFilter: 'blur(10px)',
              }}
            >
              <img 
                src={icon.icon} 
                alt={icon.name}
                style={{
                  width: '35px',
                  height: '35px',
                  filter: 'brightness(0) invert(1)',
                }}
              />
            </div>
          </Html>
        );
      })}
    </group>
  );
}

// Holographic Material with animated colors
const HolographicMaterial = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color('#00ffcc') },
      uColorB: { value: new THREE.Color('#ff00ff') },
      uColorC: { value: new THREE.Color('#ffff00') },
      uColorD: { value: new THREE.Color('#00ccff') },
    }),
    []
  );

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={`
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `}
      fragmentShader={`
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform vec3 uColorD;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          // Create flowing holographic effect
          float wave1 = sin(vUv.y * 10.0 + uTime * 2.0) * 0.5 + 0.5;
          float wave2 = sin(vUv.x * 8.0 - uTime * 1.5) * 0.5 + 0.5;
          float wave3 = sin((vUv.x + vUv.y) * 6.0 + uTime * 3.0) * 0.5 + 0.5;
          
          // Mix colors for rainbow effect
          vec3 color1 = mix(uColorA, uColorB, wave1);
          vec3 color2 = mix(uColorC, uColorD, wave2);
          vec3 finalColor = mix(color1, color2, wave3);
          
          // Add fresnel effect
          float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          finalColor += fresnel * 0.3;
          
          // Add scan lines
          float scanline = sin(vUv.y * 100.0 + uTime * 5.0) * 0.05 + 0.95;
          finalColor *= scanline;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `}
      side={THREE.DoubleSide}
    />
  );
};

// Ultra-detailed Robot Component
export function UltraRobot({ isCelebrating = false, scaleFactor = 1 }: Omit<UltraRobotProps, 'mousePosition'>) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const screenRef = useRef<THREE.Mesh>(null);
  const antennaLightRef = useRef<THREE.Mesh>(null);
  const chestCoreRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    if (isCelebrating && groupRef.current) {
      // Jump animation
      groupRef.current.position.y = Math.abs(Math.sin(time * 8)) * 0.5;
      groupRef.current.rotation.z = Math.sin(time * 10) * 0.1;
      
      // Arm flapping
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.z = Math.sin(time * 12) * 0.8 + 0.5;
        rightArmRef.current.rotation.z = -Math.sin(time * 12) * 0.8 - 0.5;
      }
    } else if (groupRef.current) {
      // Subtle floating animation
      groupRef.current.position.y = Math.sin(time * 0.6) * 0.08;
      groupRef.current.rotation.y = Math.sin(time * 0.4) * 0.05;
      groupRef.current.rotation.z = 0;
      
      // NATURAL HAND RAISING - 120 seconds cycle, then static
      if (leftArmRef.current && rightArmRef.current) {
        const cycleTime = time % 120; // 120 second cycle
        
        if (cycleTime < 8) {
          // First 8 seconds - natural hand raising
          const raiseProgress = cycleTime / 8;
          const smoothRaise = Math.sin(raiseProgress * Math.PI * 0.5); // Smooth ease-in
          
          // Natural whole arm raising (shoulder rotation)
          leftArmRef.current.rotation.z = smoothRaise * 1.2 + 0.2;
          leftArmRef.current.rotation.x = smoothRaise * 0.3;
          
          rightArmRef.current.rotation.z = -smoothRaise * 1.2 - 0.2;
          rightArmRef.current.rotation.x = smoothRaise * 0.3;
        } else {
          // Rest of cycle - hands down, gentle idle movement
          const idleWave = Math.sin(time * 0.5) * 0.08;
          
          leftArmRef.current.rotation.z = idleWave + 0.1;
          leftArmRef.current.rotation.x = 0;
          
          rightArmRef.current.rotation.z = -idleWave - 0.1;
          rightArmRef.current.rotation.x = 0;
        }
      }
    }

    // Autonomous head movement - random looking around
    if (headRef.current) {
      // Slow random scanning movement
      const lookTime = time * 0.2;
      headRef.current.rotation.y = Math.sin(lookTime) * 0.4 + Math.cos(lookTime * 0.7) * 0.2;
      headRef.current.rotation.x = Math.sin(lookTime * 0.6) * 0.25;
      headRef.current.rotation.z = Math.cos(lookTime * 0.4) * 0.08;
    }

    // Pulsing antenna light
    if (antennaLightRef.current) {
      const pulsate = Math.sin(time * 3) * 0.5 + 0.5;
      antennaLightRef.current.scale.setScalar(0.8 + pulsate * 0.4);
    }

    // Rotating chest core
    if (chestCoreRef.current) {
      chestCoreRef.current.rotation.z = time * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      {/* ============= HEAD GROUP - LOVABLE DESIGN ============= */}
      <group ref={headRef} position={[0, 1.3, 0]}>
        {/* Main Head - Larger, Rounder, More Friendly */}
        <Sphere args={[0.85, 64, 64]}>
          <meshStandardMaterial 
            color="#f0f0f0" 
            metalness={0.92}
            roughness={0.08}
            envMapIntensity={2}
          />
        </Sphere>

        {/* Head Top Crown - Unique Character Element */}
        <group position={[0, 0.75, 0]}>
          <Torus args={[0.35, 0.08, 16, 32]} rotation={[0, 0, 0]}>
            <meshStandardMaterial 
              color="#00ffcc" 
              emissive="#00ffcc"
              emissiveIntensity={1.5}
              metalness={0.95}
              roughness={0.1}
              toneMapped={false}
            />
          </Torus>
          {/* Crown center orb */}
          <Sphere args={[0.12, 32, 32]} position={[0, 0.15, 0]}>
            <meshStandardMaterial 
              color="#00ffcc" 
              emissive="#00ffcc"
              emissiveIntensity={3}
              toneMapped={false}
              transparent
              opacity={0.9}
            />
          </Sphere>
        </group>

        {/* Large Holographic Face Screen - NO EYES */}
        <RoundedBox 
          ref={screenRef}
          args={[1.3, 1.0, 0.12]} 
          radius={0.25} 
          position={[0, 0, 0.72]}
        >
          <HolographicMaterial />
        </RoundedBox>

        {/* Screen Frame - Chrome Border */}
        <RoundedBox args={[1.4, 1.1, 0.08]} radius={0.28} position={[0, 0, 0.7]}>
          <meshStandardMaterial 
            color="#c0c0c0" 
            metalness={0.98}
            roughness={0.05}
          />
        </RoundedBox>

        {/* Floating Social Media Icons in Head Screen */}
        <FloatingSocialIcons headPosition={[0, 1.3, 0]} scaleFactor={scaleFactor} />

        {/* Decorative Screen Dots - Pattern Instead of Eyes */}
        {[-0.4, -0.2, 0, 0.2, 0.4].map((x, i) => (
          <Sphere key={`screen-dot-${i}`} args={[0.03, 16, 16]} position={[x, -0.35, 0.78]}>
            <meshStandardMaterial 
              color="#00ffcc" 
              emissive="#00ffcc"
              emissiveIntensity={2}
              toneMapped={false}
            />
          </Sphere>
        ))}

        {/* Side Audio Ports - Lovable Round Design */}
        <group position={[-0.82, -0.1, 0]}>
          <Sphere args={[0.22, 32, 32]}>
            <meshStandardMaterial 
              color="#d0d0d0" 
              metalness={0.93}
              roughness={0.12}
            />
          </Sphere>
          {/* Speaker grille */}
          {[0, 1, 2].map((i) => (
            <Torus key={`left-speaker-${i}`} args={[0.12 - i * 0.03, 0.015, 8, 16]} rotation={[0, Math.PI / 2, 0]} position={[0.1, 0, 0]}>
              <meshStandardMaterial color="#0099ff" emissive="#0099ff" emissiveIntensity={0.5} />
            </Torus>
          ))}
        </group>
        <group position={[0.82, -0.1, 0]}>
          <Sphere args={[0.22, 32, 32]}>
            <meshStandardMaterial 
              color="#d0d0d0" 
              metalness={0.93}
              roughness={0.12}
            />
          </Sphere>
          {/* Speaker grille */}
          {[0, 1, 2].map((i) => (
            <Torus key={`right-speaker-${i}`} args={[0.12 - i * 0.03, 0.015, 8, 16]} rotation={[0, Math.PI / 2, 0]} position={[-0.1, 0, 0]}>
              <meshStandardMaterial color="#0099ff" emissive="#0099ff" emissiveIntensity={0.5} />
            </Torus>
          ))}
        </group>

        {/* Simple Antenna - No Pink Heart */}
        <group position={[0, 0.95, 0]}>
          {/* Antenna stem */}
          <Cylinder args={[0.03, 0.05, 0.35, 16]}>
            <meshStandardMaterial 
              color="#e0e0e0" 
              metalness={0.95}
              roughness={0.05}
            />
          </Cylinder>
          {/* Simple cyan light top */}
          <Sphere ref={antennaLightRef} args={[0.08, 32, 32]} position={[0, 0.25, 0]}>
            <meshStandardMaterial 
              color="#00ffcc" 
              emissive="#00ffcc"
              emissiveIntensity={2}
              toneMapped={false}
            />
          </Sphere>
        </group>
      </group>

      {/* ============= BODY - TESLA OPTIMUS STYLE WITH ENGINEERING DETAILS ============= */}
      {/* Upper Torso - Main Panel */}
      <RoundedBox args={[1.4, 1.2, 0.8]} radius={0.12} position={[0, 0.7, 0]}>
        <meshStandardMaterial 
          color="#f0f0f0" 
          metalness={0.92}
          roughness={0.08}
          envMapIntensity={2}
        />
      </RoundedBox>

      {/* Chest Panel Segmentation - Upper */}
      <RoundedBox args={[1.3, 0.55, 0.06]} radius={0.08} position={[0, 0.9, 0.42]}>
        <meshStandardMaterial 
          color="#d8d8d8" 
          metalness={0.95}
          roughness={0.12}
        />
      </RoundedBox>

      {/* Chest Panel - Lower */}
      <RoundedBox args={[1.3, 0.5, 0.06]} radius={0.08} position={[0, 0.4, 0.42]}>
        <meshStandardMaterial 
          color="#e8e8e8" 
          metalness={0.93}
          roughness={0.1}
        />
      </RoundedBox>

      {/* Panel Separation Lines - Horizontal */}
      {[0.9, 0.65, 0.4, 0.15].map((y, i) => (
        <Box key={`h-line-${i}`} args={[1.25, 0.015, 0.08]} position={[0, y, 0.43]}>
          <meshStandardMaterial color="#3a3a3a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Panel Separation Lines - Vertical */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <Box key={`v-line-${i}`} args={[0.015, 1.15, 0.08]} position={[x, 0.65, 0.43]}>
          <meshStandardMaterial color="#3a3a3a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Chest Core - Arc Reactor Style */}
      <group ref={chestCoreRef} position={[0, 0.65, 0.48]}>
        <Cylinder args={[0.18, 0.18, 0.04, 32]} rotation={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc"
            emissiveIntensity={3}
            toneMapped={false}
            transparent
            opacity={0.95}
          />
        </Cylinder>
        {/* Core rings */}
        {[0.15, 0.12, 0.09].map((r, i) => (
          <Torus key={`core-ring-${i}`} args={[r, 0.008, 16, 32]} position={[0, 0, 0.02]}>
            <meshStandardMaterial 
              color="#ffffff" 
              emissive="#00ffcc"
              emissiveIntensity={2 - i * 0.5}
              metalness={0.95}
              toneMapped={false}
            />
          </Torus>
        ))}
      </group>

      {/* Lightning Bolt Details - Slant Panels */}
      {/* Left lightning */}
      <group position={[-0.35, 0.65, 0.47]} rotation={[0, 0, 0.3]}>
        <Box args={[0.06, 0.25, 0.01]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.08, 0.02, 0.01]} position={[0.04, -0.08, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.05, 0.15, 0.01]} position={[-0.02, -0.15, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
      </group>

      {/* Right lightning */}
      <group position={[0.35, 0.65, 0.47]} rotation={[0, 0, -0.3]}>
        <Box args={[0.06, 0.25, 0.01]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.08, 0.02, 0.01]} position={[-0.04, -0.08, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.05, 0.15, 0.01]} position={[0.02, -0.15, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
      </group>

      {/* Abdominal Region - Segmented Panels */}
      <RoundedBox args={[1.2, 0.9, 0.7]} radius={0.1} position={[0, -0.05, 0]}>
        <meshStandardMaterial 
          color="#e0e0e0" 
          metalness={0.9}
          roughness={0.12}
        />
      </RoundedBox>

      {/* Ab Panel Details - 3 Segments */}
      {[-0.15, 0.05, 0.25].map((y, i) => (
        <RoundedBox key={`ab-${i}`} args={[1.1, 0.25, 0.06]} radius={0.06} position={[0, y, 0.37]}>
          <meshStandardMaterial 
            color={i === 1 ? "#d0d0d0" : "#c8c8c8"} 
            metalness={0.93}
            roughness={0.1}
          />
        </RoundedBox>
      ))}

      {/* Ab Joint Lines */}
      {[-0.02, 0.17].map((y, i) => (
        <Box key={`ab-joint-${i}`} args={[1.05, 0.02, 0.08]} position={[0, y, 0.38]}>
          <meshStandardMaterial color="#2a2a2a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Side Vents - Engineering Detail */}
      {[-0.55, 0.55].map((x, side) => (
        <group key={`vent-${side}`} position={[x, 0.3, 0.3]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Box key={i} args={[0.03, 0.4, 0.02]} position={[0, i * 0.1 - 0.2, 0]} rotation={[0, 0.2, 0]}>
              <meshStandardMaterial color="#1a1a1a" metalness={0.95} roughness={0.1} />
            </Box>
          ))}
        </group>
      ))}

      {/* Interactive Input Field - BEHIND ROBOT */}
      <Html
        position={[0, 0.5, -1.2]}
        transform
        occlude={false}
        distanceFactor={2}
        zIndexRange={[0, -100]}
      >
        <div className="robot-chest-input-container" style={{ pointerEvents: 'auto' }}>
          <div className="chest-input-wrapper">
            <div className="chest-prompt-text">Name me as the smartest SMM! 🚀</div>
          </div>
        </div>
      </Html>

      {/* ============= ARMS ============= */}
      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.8, 0.6, 0]}>
        {/* Shoulder joint */}
        <Sphere args={[0.18, 32, 32]} position={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#c0c0c0" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Upper arm */}
        <Cylinder args={[0.14, 0.14, 0.7, 16]} position={[0, -0.35, 0]}>
          <meshStandardMaterial 
            color="#e0e0e0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Elbow joint */}
        <Sphere args={[0.15, 32, 32]} position={[0, -0.7, 0]}>
          <meshStandardMaterial 
            color="#b0b0b0" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Forearm */}
        <Cylinder args={[0.12, 0.1, 0.6, 16]} position={[0, -1.05, 0]}>
          <meshStandardMaterial 
            color="#d8d8d8" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Humanoid Hand with Fingers */}
        <group position={[0, -1.42, 0]}>
          {/* Palm */}
          <RoundedBox args={[0.18, 0.25, 0.12]} radius={0.05}>
            <meshStandardMaterial 
              color="#c8c8c8" 
              metalness={0.9}
              roughness={0.15}
            />
          </RoundedBox>
          {/* Thumb */}
          <group position={[-0.12, -0.08, 0.02]} rotation={[0, 0, -0.3]}>
            <RoundedBox args={[0.04, 0.12, 0.04]} radius={0.02}>
              <meshStandardMaterial color="#b8b8b8" metalness={0.9} roughness={0.15} />
            </RoundedBox>
          </group>
          {/* Fingers */}
          {[-0.06, -0.02, 0.02, 0.06].map((x, i) => (
            <group key={i} position={[x, -0.18, 0]}>
              <RoundedBox args={[0.03, 0.15, 0.03]} radius={0.015}>
                <meshStandardMaterial color="#b8b8b8" metalness={0.9} roughness={0.15} />
              </RoundedBox>
            </group>
          ))}
        </group>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.8, 0.6, 0]}>
        {/* Shoulder joint */}
        <Sphere args={[0.18, 32, 32]} position={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#c0c0c0" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Upper arm */}
        <Cylinder args={[0.14, 0.14, 0.7, 16]} position={[0, -0.35, 0]}>
          <meshStandardMaterial 
            color="#e0e0e0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Elbow joint */}
        <Sphere args={[0.15, 32, 32]} position={[0, -0.7, 0]}>
          <meshStandardMaterial 
            color="#b0b0b0" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Forearm */}
        <Cylinder args={[0.12, 0.1, 0.6, 16]} position={[0, -1.05, 0]}>
          <meshStandardMaterial 
            color="#d8d8d8" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Humanoid Hand with Fingers */}
        <group position={[0, -1.42, 0]}>
          {/* Palm */}
          <RoundedBox args={[0.18, 0.25, 0.12]} radius={0.05}>
            <meshStandardMaterial 
              color="#c8c8c8" 
              metalness={0.9}
              roughness={0.15}
            />
          </RoundedBox>
          {/* Thumb */}
          <group position={[0.12, -0.08, 0.02]} rotation={[0, 0, 0.3]}>
            <RoundedBox args={[0.04, 0.12, 0.04]} radius={0.02}>
              <meshStandardMaterial color="#b8b8b8" metalness={0.9} roughness={0.15} />
            </RoundedBox>
          </group>
          {/* Fingers */}
          {[-0.06, -0.02, 0.02, 0.06].map((x, i) => (
            <group key={`right-finger-${i}`} position={[x, -0.18, 0]}>
              <RoundedBox args={[0.03, 0.15, 0.03]} radius={0.015}>
                <meshStandardMaterial color="#b8b8b8" metalness={0.9} roughness={0.15} />
              </RoundedBox>
            </group>
          ))}
        </group>
      </group>

      {/* ============= LEGS ============= */}
      {/* Left Leg */}
      <group position={[-0.35, -0.4, 0]}>
        {/* Hip joint */}
        <Sphere args={[0.16, 32, 32]} position={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#b8b8b8" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Upper leg */}
        <Cylinder args={[0.13, 0.13, 0.6, 16]} position={[0, -0.3, 0]}>
          <meshStandardMaterial 
            color="#e0e0e0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Knee joint */}
        <Sphere args={[0.14, 32, 32]} position={[0, -0.6, 0]}>
          <meshStandardMaterial 
            color="#a8a8a8" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Lower leg */}
        <Cylinder args={[0.11, 0.14, 0.5, 16]} position={[0, -0.88, 0]}>
          <meshStandardMaterial 
            color="#d0d0d0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Humanoid Shoe/Foot */}
        <group position={[0, -1.2, 0]}>
          {/* Sole */}
          <RoundedBox args={[0.24, 0.08, 0.4]} radius={0.04} position={[0, -0.04, 0.1]}>
            <meshStandardMaterial 
              color="#2a2a2a" 
              metalness={0.85}
              roughness={0.3}
            />
          </RoundedBox>
          {/* Shoe upper */}
          <RoundedBox args={[0.22, 0.16, 0.32]} radius={0.06} position={[0, 0.04, 0.08]}>
            <meshStandardMaterial 
              color="#1a1a1a" 
              metalness={0.8}
              roughness={0.25}
            />
          </RoundedBox>
          {/* Toe cap detail */}
          <RoundedBox args={[0.2, 0.12, 0.15]} radius={0.05} position={[0, 0.02, 0.22]}>
            <meshStandardMaterial 
              color="#0a0a0a" 
              metalness={0.9}
              roughness={0.2}
            />
          </RoundedBox>
        </group>
      </group>

      {/* Right Leg */}
      <group position={[0.35, -0.4, 0]}>
        {/* Hip joint */}
        <Sphere args={[0.16, 32, 32]} position={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#b8b8b8" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Upper leg */}
        <Cylinder args={[0.13, 0.13, 0.6, 16]} position={[0, -0.3, 0]}>
          <meshStandardMaterial 
            color="#e0e0e0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Knee joint */}
        <Sphere args={[0.14, 32, 32]} position={[0, -0.6, 0]}>
          <meshStandardMaterial 
            color="#a8a8a8" 
            metalness={0.95}
            roughness={0.1}
          />
        </Sphere>
        {/* Lower leg */}
        <Cylinder args={[0.11, 0.14, 0.5, 16]} position={[0, -0.88, 0]}>
          <meshStandardMaterial 
            color="#d0d0d0" 
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        {/* Humanoid Shoe/Foot */}
        <group position={[0, -1.2, 0]}>
          {/* Sole */}
          <RoundedBox args={[0.24, 0.08, 0.4]} radius={0.04} position={[0, -0.04, 0.1]}>
            <meshStandardMaterial 
              color="#2a2a2a" 
              metalness={0.85}
              roughness={0.3}
            />
          </RoundedBox>
          {/* Shoe upper */}
          <RoundedBox args={[0.22, 0.16, 0.32]} radius={0.06} position={[0, 0.04, 0.08]}>
            <meshStandardMaterial 
              color="#1a1a1a" 
              metalness={0.8}
              roughness={0.25}
            />
          </RoundedBox>
          {/* Toe cap detail */}
          <RoundedBox args={[0.2, 0.12, 0.15]} radius={0.05} position={[0, 0.02, 0.22]}>
            <meshStandardMaterial 
              color="#0a0a0a" 
              metalness={0.9}
              roughness={0.2}
            />
          </RoundedBox>
        </group>
      </group>

      {/* ============= STANDING PLATFORM/STAGE ============= */}
      {/* Main circular platform */}
      <group position={[0, -1.5, 0]}>
        {/* Base platform */}
        <Cylinder args={[1.2, 1.2, 0.15, 32]} position={[0, 0, 0]}>
          <meshStandardMaterial 
            color="#1a1a1a" 
            metalness={0.85}
            roughness={0.25}
            envMapIntensity={1.5}
          />
        </Cylinder>
        
        {/* Platform rim (glow ring) */}
        <Torus args={[1.2, 0.03, 16, 64]} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc"
            emissiveIntensity={2}
            metalness={0.9}
            roughness={0.1}
            toneMapped={false}
          />
        </Torus>
        
        {/* Inner platform detail */}
        <Cylinder args={[0.9, 0.9, 0.18, 32]} position={[0, -0.02, 0]}>
          <meshStandardMaterial 
            color="#0a0a0a" 
            metalness={0.95}
            roughness={0.15}
          />
        </Cylinder>
        
        {/* Center core glow */}
        <Cylinder args={[0.3, 0.3, 0.2, 32]} position={[0, 0.1, 0]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc"
            emissiveIntensity={3}
            metalness={0.8}
            roughness={0.2}
            toneMapped={false}
            transparent
            opacity={0.8}
          />
        </Cylinder>

        {/* Decorative panels around platform */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i / 6) * Math.PI * 2;
          const x = Math.cos(angle) * 1.05;
          const z = Math.sin(angle) * 1.05;
          return (
            <Box 
              key={i}
              args={[0.15, 0.08, 0.03]} 
              position={[x, 0.08, z]}
              rotation={[0, -angle, 0]}
            >
              <meshStandardMaterial 
                color="#00ffcc" 
                emissive="#00ffcc"
                emissiveIntensity={1.5}
                metalness={0.9}
                roughness={0.1}
                toneMapped={false}
              />
            </Box>
          );
        })}

        {/* LED strip indicators */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i / 8) * Math.PI * 2;
          const x = Math.cos(angle) * 0.85;
          const z = Math.sin(angle) * 0.85;
          return (
            <Sphere 
              key={`led-${i}`}
              args={[0.02, 16, 16]} 
              position={[x, 0.1, z]}
            >
              <meshStandardMaterial 
                color={i % 2 === 0 ? "#00ffcc" : "#0099ff"} 
                emissive={i % 2 === 0 ? "#00ffcc" : "#0099ff"}
                emissiveIntensity={2.5}
                toneMapped={false}
              />
            </Sphere>
          );
        })}
      </group>
    </group>
  );
}

// Standing platform with reflective surface - ROTATING ANIMATION
export function StandingPlatform() {
  const platformRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (platformRef.current) {
      // Smooth circular rotation animation
      platformRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });
  
  return (
    <>
      {/* Rotating platform group */}
      <group ref={platformRef} position={[0, -1.5, 0]}>
        {/* Platform base - will rotate */}
        <Cylinder args={[1.2, 1.2, 0.15, 32]}>
          <meshStandardMaterial 
            color="#1a1a1a" 
            metalness={0.85}
            roughness={0.25}
            envMapIntensity={1.5}
          />
        </Cylinder>
        
        {/* Rotating glow ring */}
        <Torus args={[1.2, 0.03, 16, 64]} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc"
            emissiveIntensity={2}
            metalness={0.9}
            roughness={0.1}
            toneMapped={false}
          />
        </Torus>
        
        {/* Inner detail */}
        <Cylinder args={[0.9, 0.9, 0.18, 32]} position={[0, -0.02, 0]}>
          <meshStandardMaterial 
            color="#0a0a0a" 
            metalness={0.95}
            roughness={0.15}
          />
        </Cylinder>
        
        {/* LEDs rotating with platform */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i / 8) * Math.PI * 2;
          const x = Math.cos(angle) * 0.85;
          const z = Math.sin(angle) * 0.85;
          return (
            <Sphere 
              key={`led-${i}`}
              args={[0.02, 16, 16]} 
              position={[x, 0.1, z]}
            >
              <meshStandardMaterial 
                color={i % 2 === 0 ? "#00ffcc" : "#0099ff"} 
                emissive={i % 2 === 0 ? "#00ffcc" : "#0099ff"}
                emissiveIntensity={2.5}
                toneMapped={false}
              />
            </Sphere>
          );
        })}
      </group>
      
      {/* Static reflective floor underneath */}
      <group position={[0, -1.65, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[10, 10]} />
          <MeshReflectorMaterial
            blur={[300, 100]}
            resolution={1024}
            mixBlur={1}
            mixStrength={0.5}
            roughness={1}
            depthScale={1.2}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#050505"
            metalness={0.8}
            mirror={0.5}
          />
        </mesh>
      </group>
    </>
  );
}

// Professional Lighting & Environment Setup (DARK DRAMATIC STYLE)
function Scene({ isCelebrating = false }: { isCelebrating?: boolean }) {
  return (
    <>
      {/* NATURAL LIGHTING - Bright to see structure */}
      <ambientLight intensity={0.6} />
      
      {/* Main Key Light - Natural bright lighting */}
      <spotLight 
        position={[0, 10, 3]} 
        angle={0.6} 
        penumbra={1} 
        intensity={5}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
      />
      
      {/* Front fill light - See structure clearly */}
      <spotLight 
        position={[0, 3, 8]} 
        angle={0.8} 
        penumbra={1} 
        intensity={3}
        color="#ffffff"
      />
      
      {/* Rim Light - Back edge lighting (chrome highlight) */}
      <spotLight 
        position={[0, 4, -6]} 
        angle={0.8} 
        penumbra={1} 
        intensity={2.5}
        color="#e0e0e0"
      />
      
      {/* Cyan accent from left */}
      <pointLight 
        position={[-5, 3, 2]} 
        intensity={1.8}
        color="#00ffcc"
        distance={10}
      />
      
      {/* Blue accent from right */}
      <pointLight 
        position={[5, 3, 2]} 
        intensity={1.5}
        color="#0099ff"
        distance={10}
      />
      
      {/* Magenta dramatic accent from back */}
      <pointLight 
        position={[0, 2, -4]} 
        intensity={1.2}
        color="#ff00ff"
        distance={8}
      />

      {/* Under-glow from platform */}
      <pointLight 
        position={[0, -1.3, 0]} 
        intensity={2.0}
        color="#00ffcc"
        distance={3}
      />

      {/* Reflective standing platform */}
      <StandingPlatform />

      {/* Robot - Standing (no float) */}
      <UltraRobot isCelebrating={isCelebrating} />

      {/* DARK Studio Environment */}
      <Environment preset="night" environmentIntensity={0.3} />
      
      {/* Soft shadows */}
      <ContactShadows
        position={[0, -1.55, 0]}
        opacity={0.6}
        scale={4}
        blur={3}
        far={3}
        resolution={1024}
        color="#000000"
      />
    </>
  );
}

interface UltraRobotMascotProps {
  mousePosition: { x: number; y: number };
}

const UltraRobotMascot: React.FC<UltraRobotMascotProps> = () => {
  const [robotName, setRobotName] = useState('');
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [isNamed, setIsNamed] = useState(false);
  const [savedName, setSavedName] = useState('');
  const { currentUser } = useAuth();

  // Check if robot is already named on mount
  React.useEffect(() => {
    const existingName = localStorage.getItem('robot_mascot_name');
    if (existingName) {
      setSavedName(existingName);
      setIsNamed(true);
      setShowInput(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (robotName.trim()) {
      // Save robot name to localStorage for AI Manager to use
      localStorage.setItem('robot_mascot_name', robotName.trim());
      setSavedName(robotName.trim());
      
      // Start celebration animation
      setIsCelebrating(true);
      setShowInput(false);

      // After 2.5 seconds, navigate based on auth status
      setTimeout(() => {
        if (currentUser) {
          // User is logged in - go to main dashboard
          window.location.href = '/maindashboard';
        } else {
          // User not logged in - go to signup
          window.location.href = '/account';
        }
      }, 2500);
    }
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '800px', 
      position: 'relative',
      background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 50%, #000000 100%)'
    }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7], fov: 45 }}
        gl={{ 
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0
        }}
        style={{ background: '#000000' }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 5, 15]} />
        
        <Scene isCelebrating={isCelebrating} />
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={Math.PI / 5}
          autoRotate={false}
          autoRotateSpeed={0.5}
        />
      </Canvas>

      {/* Input Form Inside Robot Chest */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            className="robot-chest-form-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <form onSubmit={handleSubmit} className="robot-chest-form">
              <input
                type="text"
                value={robotName}
                onChange={(e) => setRobotName(e.target.value)}
                placeholder="Type my name..."
                className="robot-chest-input"
                autoFocus
              />
              
              <motion.button
                type="submit"
                className="robot-chest-submit-btn"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ✨
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration Message */}
      <AnimatePresence>
        {isCelebrating && (
          <motion.div
            className="celebration-message"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{
                duration: 0.5,
                repeat: 3
              }}
            >
              <span className="celebration-text">
                🎉 Yay! I'm {robotName}! 🎉
              </span>
            </motion.div>
            <div className="celebration-subtext">Taking you to your dashboard...</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Working Message - Shows when already named */}
      <AnimatePresence>
        {isNamed && !isCelebrating && (
          <motion.div
            className="working-message"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="working-content"
              animate={{ 
                y: [0, -8, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="working-icon">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                </motion.div>
              </div>
              <div className="working-text">
                Your <span className="manager-name">{savedName}</span> is sleeplessly working for you!
              </div>
              <div className="working-subtext">
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  🤖 Always ready • 24/7 available • Zero downtime
                </motion.span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UltraRobotMascot;
