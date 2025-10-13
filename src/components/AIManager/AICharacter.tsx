/**
 * 3D AI Manager Character - SAME ROBOT AS HOMEPAGE
 * Uses Three.js mini version of homepage robot
 */

import React, { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Sphere, Cylinder, Torus, Box } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import './AICharacter.css';

interface AICharacterProps {
  onHover: (isHovering: boolean) => void;
  onClick: () => void;
}

// EXACT Tesla Optimus Robot from Homepage (Mini Version)
function MiniRobot({ isRaised }: { isRaised: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const chestCoreRef = useRef<THREE.Group>(null);
  const Box = (props: any) => <mesh {...props}><boxGeometry args={props.args} /><meshStandardMaterial {...props.children.props} /></mesh>;

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Floating animation
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(time * 2) * 0.03;
    }

    // Rotating chest core
    if (chestCoreRef.current) {
      chestCoreRef.current.rotation.z = time * 0.5;
    }

    // Hand raising
    if (leftArmRef.current && rightArmRef.current) {
      if (isRaised) {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 1.2, 0.15);
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, -1.2, 0.15);
      } else {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0.2, 0.15);
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, -0.2, 0.15);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.4, 0]} scale={0.32}>
      {/* HEAD */}
      <group position={[0, 1.3, 0]}>
        <Sphere args={[0.85, 32, 32]}>
          <meshStandardMaterial color="#f0f0f0" metalness={0.92} roughness={0.08} />
        </Sphere>
        
        {/* Crown */}
        <Torus args={[0.35, 0.08, 16, 32]} position={[0, 0.75, 0]}>
          <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={1.5} metalness={0.95} toneMapped={false} />
        </Torus>
        
        {/* Holographic Screen */}
        <RoundedBox args={[1.3, 1.0, 0.12]} radius={0.25} position={[0, 0, 0.72]}>
          <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.6} transparent opacity={0.85} toneMapped={false} />
        </RoundedBox>
        
        {/* Antenna */}
        <Cylinder args={[0.03, 0.05, 0.35, 16]} position={[0, 0.95, 0]}>
          <meshStandardMaterial color="#e0e0e0" metalness={0.95} roughness={0.05} />
        </Cylinder>
        <Sphere args={[0.08, 16, 16]} position={[0, 1.2, 0]}>
          <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2} toneMapped={false} />
        </Sphere>
      </group>

      {/* TESLA OPTIMUS BODY */}
      <RoundedBox args={[1.4, 1.2, 0.8]} radius={0.12} position={[0, 0.7, 0]}>
        <meshStandardMaterial color="#f0f0f0" metalness={0.92} roughness={0.08} />
      </RoundedBox>

      {/* Chest Panels */}
      <RoundedBox args={[1.3, 0.55, 0.06]} radius={0.08} position={[0, 0.9, 0.42]}>
        <meshStandardMaterial color="#d8d8d8" metalness={0.95} roughness={0.12} />
      </RoundedBox>
      <RoundedBox args={[1.3, 0.5, 0.06]} radius={0.08} position={[0, 0.4, 0.42]}>
        <meshStandardMaterial color="#e8e8e8" metalness={0.93} roughness={0.1} />
      </RoundedBox>

      {/* Panel Lines - Horizontal */}
      {[0.9, 0.65, 0.4].map((y, i) => (
        <Box key={`h-${i}`} args={[1.25, 0.015, 0.08]} position={[0, y, 0.43]}>
          <meshStandardMaterial color="#3a3a3a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Panel Lines - Vertical */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <Box key={`v-${i}`} args={[0.015, 1.15, 0.08]} position={[x, 0.65, 0.43]}>
          <meshStandardMaterial color="#3a3a3a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Arc Reactor Core */}
      <group ref={chestCoreRef} position={[0, 0.65, 0.48]}>
        <Cylinder args={[0.18, 0.18, 0.04, 32]}>
          <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={3} toneMapped={false} transparent opacity={0.95} />
        </Cylinder>
        {[0.15, 0.12, 0.09].map((r, i) => (
          <Torus key={i} args={[r, 0.008, 16, 32]} position={[0, 0, 0.02]}>
            <meshStandardMaterial color="#ffffff" emissive="#00ffcc" emissiveIntensity={2 - i * 0.5} metalness={0.95} toneMapped={false} />
          </Torus>
        ))}
      </group>

      {/* Lightning Bolts */}
      <group position={[-0.35, 0.65, 0.47]} rotation={[0, 0, 0.3]}>
        <Box args={[0.06, 0.25, 0.01]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.08, 0.02, 0.01]} position={[0.04, -0.08, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.05, 0.15, 0.01]} position={[-0.02, -0.15, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
      </group>
      <group position={[0.35, 0.65, 0.47]} rotation={[0, 0, -0.3]}>
        <Box args={[0.06, 0.25, 0.01]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.08, 0.02, 0.01]} position={[-0.04, -0.08, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
        <Box args={[0.05, 0.15, 0.01]} position={[0.02, -0.15, 0]}>
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} toneMapped={false} />
        </Box>
      </group>

      {/* Abdominal Region */}
      <RoundedBox args={[1.2, 0.9, 0.7]} radius={0.1} position={[0, -0.05, 0]}>
        <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.12} />
      </RoundedBox>

      {/* 3 Ab Segments */}
      {[-0.15, 0.05, 0.25].map((y, i) => (
        <RoundedBox key={`ab-${i}`} args={[1.1, 0.25, 0.06]} radius={0.06} position={[0, y, 0.37]}>
          <meshStandardMaterial color={i === 1 ? "#d0d0d0" : "#c8c8c8"} metalness={0.93} roughness={0.1} />
        </RoundedBox>
      ))}

      {/* Ab Joint Lines */}
      {[-0.02, 0.17].map((y, i) => (
        <Box key={`joint-${i}`} args={[1.05, 0.02, 0.08]} position={[0, y, 0.38]}>
          <meshStandardMaterial color="#2a2a2a" metalness={0.98} roughness={0.05} />
        </Box>
      ))}

      {/* Side Vents */}
      {[-0.55, 0.55].map((x, s) => (
        <group key={`vent-${s}`} position={[x, 0.3, 0.3]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Box key={i} args={[0.03, 0.4, 0.02]} position={[0, i * 0.1 - 0.2, 0]} rotation={[0, 0.2, 0]}>
              <meshStandardMaterial color="#1a1a1a" metalness={0.95} roughness={0.1} />
            </Box>
          ))}
        </group>
      ))}

      {/* Arms */}
      <group ref={leftArmRef} position={[-0.8, 0.6, 0]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial color="#c0c0c0" metalness={0.95} roughness={0.1} />
        </Sphere>
        <Cylinder args={[0.14, 0.14, 0.7, 16]} position={[0, -0.35, 0]}>
          <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.15} />
        </Cylinder>
      </group>
      <group ref={rightArmRef} position={[0.8, 0.6, 0]}>
        <Sphere args={[0.18, 16, 16]}>
          <meshStandardMaterial color="#c0c0c0" metalness={0.95} roughness={0.1} />
        </Sphere>
        <Cylinder args={[0.14, 0.14, 0.7, 16]} position={[0, -0.35, 0]}>
          <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.15} />
        </Cylinder>
      </group>

      {/* Legs */}
      <Cylinder args={[0.14, 0.14, 0.5, 16]} position={[-0.35, -0.2, 0]}>
        <meshStandardMaterial color="#d0d0d0" metalness={0.9} roughness={0.15} />
      </Cylinder>
      <Cylinder args={[0.14, 0.14, 0.5, 16]} position={[0.35, -0.2, 0]}>
        <meshStandardMaterial color="#d0d0d0" metalness={0.9} roughness={0.15} />
      </Cylinder>

      {/* BETA TEXT - SUPER BRIGHT AND VISIBLE */}
      <group position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {/* B */}
        <Box args={[0.08, 0.2, 0.03]} position={[-0.15, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[-0.12, 0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[-0.12, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[-0.12, -0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        
        {/* E */}
        <Box args={[0.08, 0.2, 0.03]} position={[-0.05, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[-0.02, 0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.04, 0.02, 0.03]} position={[-0.03, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[-0.02, -0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        
        {/* T */}
        <Box args={[0.08, 0.02, 0.03]} position={[0.05, 0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.02, 0.15, 0.03]} position={[0.05, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        
        {/* A */}
        <Box args={[0.08, 0.2, 0.03]} position={[0.15, 0, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.06, 0.02, 0.03]} position={[0.15, 0.08, 0]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.02, 0.08, 0.03]} position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
        <Box args={[0.02, 0.08, 0.03]} position={[0.17, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff"
            emissiveIntensity={3.0}
            toneMapped={false}
          />
        </Box>
      </group>
    </group>
  );
}

export const AICharacter: React.FC<AICharacterProps> = ({ onHover, onClick }) => {
  const [isRaised, setIsRaised] = useState(false);

  const handleClick = () => {
    setIsRaised(true);
    setTimeout(() => setIsRaised(false), 1000);
    onClick();
  };

  return (
    <motion.div
      className="ai-character-container"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={handleClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      style={{
        width: '100px',
        height: '100px',
        cursor: 'pointer',
        position: 'relative',
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(0, 255, 204, 0.6)',
        border: '2px solid rgba(0, 255, 204, 0.8)',
        background: 'radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.95) 100%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0.5, 3], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.5} />
        <spotLight position={[5, 5, 5]} intensity={1} />
        <spotLight position={[-5, 5, 5]} intensity={0.5} color="#00ffcc" />
        <MiniRobot isRaised={isRaised} />
      </Canvas>
    </motion.div>
  );
};
