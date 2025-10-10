/**
 * AI Manager Robot - Mini version of the homepage Tesla-Optimus robot with stage
 */

import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import './AIManagerRobot.css';
import { UltraRobot, StandingPlatform } from '../homepage/UltraRobotMascot';

interface AIManagerRobotProps {
  onClick: () => void;
  onHover: (isHovered: boolean) => void;
}

export const AIManagerRobot: React.FC<AIManagerRobotProps> = ({ onClick, onHover }) => {
  const [raise, setRaise] = useState(false);

  const handleMouseEnter = () => {
    setRaise(true);
    onHover(true);
  };

  const handleMouseLeave = () => {
    setRaise(false);
    onHover(false);
  };

  const handleClick = () => {
    setRaise(true);
    onClick();
    setTimeout(() => setRaise(false), 800);
  };

  return (
    <motion.div
      className="ai-manager-robot-container"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        style={{ width: '100%', height: '100%', cursor: 'pointer' }}
      >
        {/* Match homepage Scene lighting */}
        <ambientLight intensity={0.6} />
        <spotLight position={[0, 10, 3]} angle={0.6} penumbra={1} intensity={5} color="#ffffff" castShadow shadow-mapSize={[1024,1024]} shadow-bias={-0.0001} />
        <spotLight position={[0, 3, 8]} angle={0.8} penumbra={1} intensity={3} color="#ffffff" />
        <spotLight position={[0, 4, -6]} angle={0.8} penumbra={1} intensity={2.5} color="#e0e0e0" />
        <pointLight position={[-5, 3, 2]} intensity={1.8} color="#00ffcc" distance={10} />
        <pointLight position={[5, 3, 2]} intensity={1.5} color="#0099ff" distance={10} />
        <pointLight position={[0, 2, -4]} intensity={1.2} color="#ff00ff" distance={8} />
        <pointLight position={[0, -1.3, 0]} intensity={2.0} color="#00ffcc" distance={3} />

        {/* Exact homepage robot + stage, scaled to fit */}
        <group scale={0.35} position={[0, -0.4, 0]}>
          <StandingPlatform />
          <UltraRobot isCelebrating={raise} scaleFactor={0.35} />
        </group>

        <Environment preset="night" />
        <ContactShadows rotation={[Math.PI / 2, 0, 0]} position={[0, -1.55, 0]} opacity={0.5} width={6} height={6} blur={2.5} far={3} />
      </Canvas>

      {/* Pulsing ring and notification badge removed per request */}
    </motion.div>
  );
};
