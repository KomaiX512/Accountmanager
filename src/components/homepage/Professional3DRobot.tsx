import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  OrbitControls, 
  Environment, 
  ContactShadows,
  Float,
  Sphere,
  Box,
  Cylinder,
  RoundedBox
} from '@react-three/drei';
import * as THREE from 'three';

interface RobotProps {
  mousePosition: { x: number; y: number };
}

// Professional 3D Robot built with Three.js primitives
function Robot({ mousePosition }: RobotProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const leftEyeRef = useRef<THREE.Mesh>(null!);
  const rightEyeRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle floating animation
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }

    // Head follows mouse (inverted for correct direction)
    if (headRef.current) {
      const targetRotationY = -mousePosition.x * 0.3;
      const targetRotationX = -mousePosition.y * 0.3;
      
      headRef.current.rotation.y += (targetRotationY - headRef.current.rotation.y) * 0.1;
      headRef.current.rotation.x += (targetRotationX - headRef.current.rotation.x) * 0.1;
    }

    // Eyes follow mouse (inverted for correct direction)
    if (leftEyeRef.current && rightEyeRef.current) {
      const eyeMovementX = -mousePosition.x * 0.15;
      const eyeMovementY = -mousePosition.y * 0.15;
      
      leftEyeRef.current.position.x = -0.3 + eyeMovementX;
      leftEyeRef.current.position.y = 0.3 + eyeMovementY;
      
      rightEyeRef.current.position.x = 0.3 + eyeMovementX;
      rightEyeRef.current.position.y = 0.3 + eyeMovementY;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Robot Head */}
      <group ref={headRef}>
        <RoundedBox args={[1.2, 1, 1.2]} radius={0.2} position={[0, 0.5, 0]}>
          <meshStandardMaterial 
            color="#1a1a2e" 
            metalness={0.9}
            roughness={0.1}
            envMapIntensity={1}
          />
        </RoundedBox>

        {/* Antenna */}
        <Cylinder args={[0.03, 0.03, 0.4]} position={[0, 1.2, 0]}>
          <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.5} />
        </Cylinder>
        <Sphere args={[0.08]} position={[0, 1.4, 0]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc" 
            emissiveIntensity={2}
            toneMapped={false}
          />
        </Sphere>

        {/* Eyes */}
        <Sphere ref={leftEyeRef} args={[0.15]} position={[-0.2, 0.6, 0.5]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc" 
            emissiveIntensity={1}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>
        <Sphere ref={rightEyeRef} args={[0.15]} position={[0.2, 0.6, 0.5]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc" 
            emissiveIntensity={1}
            metalness={0.5}
            roughness={0.2}
          />
        </Sphere>

        {/* Pupils */}
        <Sphere args={[0.08]} position={[-0.2 + mousePosition.x * 0.05, 0.6 + mousePosition.y * 0.05, 0.58]}>
          <meshStandardMaterial color="#000000" />
        </Sphere>
        <Sphere args={[0.08]} position={[0.2 + mousePosition.x * 0.05, 0.6 + mousePosition.y * 0.05, 0.58]}>
          <meshStandardMaterial color="#000000" />
        </Sphere>

        {/* Mouth */}
        <Box args={[0.4, 0.05, 0.05]} position={[0, 0.2, 0.55]}>
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc" 
            emissiveIntensity={0.5}
          />
        </Box>
      </group>

      {/* Robot Body */}
      <RoundedBox args={[1.4, 1.6, 1]} radius={0.15} position={[0, -0.8, 0]}>
        <meshStandardMaterial 
          color="#16213e" 
          metalness={0.9}
          roughness={0.1}
          envMapIntensity={1}
        />
      </RoundedBox>

      {/* Chest Core - Glowing Heart */}
      <Sphere args={[0.25]} position={[0, -0.5, 0.52]}>
        <meshStandardMaterial 
          color="#00ffcc" 
          emissive="#00ffcc" 
          emissiveIntensity={3}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </Sphere>

      {/* Arms */}
      <group position={[-0.8, -0.5, 0]}>
        <Cylinder args={[0.15, 0.15, 1.2]} rotation={[0, 0, Math.PI / 6]}>
          <meshStandardMaterial 
            color="#1a1a2e" 
            metalness={0.8}
            roughness={0.2}
          />
        </Cylinder>
      </group>
      
      <group position={[0.8, -0.5, 0]}>
        <Cylinder args={[0.15, 0.15, 1.2]} rotation={[0, 0, -Math.PI / 6]}>
          <meshStandardMaterial 
            color="#1a1a2e" 
            metalness={0.8}
            roughness={0.2}
          />
        </Cylinder>
      </group>

      {/* Decorative Elements */}
      {[...Array(5)].map((_, i) => (
        <Sphere 
          key={i}
          args={[0.03]} 
          position={[
            (i - 2) * 0.2,
            -1.3,
            0.52
          ]}
        >
          <meshStandardMaterial 
            color="#00ffcc" 
            emissive="#00ffcc" 
            emissiveIntensity={1}
          />
        </Sphere>
      ))}
    </group>
  );
}

// Scene with professional lighting
function Scene({ mousePosition }: RobotProps) {
  return (
    <>
      {/* Advanced Lighting Setup */}
      <ambientLight intensity={0.3} />
      <spotLight 
        position={[5, 5, 5]} 
        angle={0.3} 
        penumbra={1} 
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight 
        position={[-5, 5, -5]} 
        angle={0.3} 
        penumbra={1} 
        intensity={1}
        color="#00ffcc"
      />
      <pointLight position={[0, 0, 5]} intensity={1} color="#00ccff" />
      
      {/* Robot with Float effect */}
      <Float
        speed={2}
        rotationIntensity={0.3}
        floatIntensity={0.5}
      >
        <Robot mousePosition={mousePosition} />
      </Float>

      {/* Professional Environment - Removed external HDR to fix loading error */}
      
      {/* Contact Shadows */}
      <ContactShadows
        position={[0, -2.5, 0]}
        opacity={0.5}
        scale={10}
        blur={2}
        far={4}
      />

      {/* Post Processing Effects - Removed to fix error */}
    </>
  );
}

interface Professional3DRobotProps {
  mousePosition: { x: number; y: number };
}

// Animated Speech Bubble Component
const AnimatedSpeechBubble: React.FC<{ message: string }> = ({ message }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
    setDisplayedText('');
    
    // Box opening animation
    const expandTimer = setTimeout(() => {
      setIsExpanded(true);
    }, 300);

    // Typing animation
    const typingTimer = setTimeout(() => {
      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        if (currentIndex <= message.length) {
          setDisplayedText(message.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(typingInterval);
        }
      }, 50);
      
      return () => clearInterval(typingInterval);
    }, 600);

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(typingTimer);
    };
  }, [message]);

  return (
    <div className={`robot-speech-bubble ${isExpanded ? 'expanded' : ''}`}>
      <div className="speech-bubble-content">
        {displayedText}
        <span className="typing-cursor">|</span>
      </div>
    </div>
  );
};

const Professional3DRobot: React.FC<Professional3DRobotProps> = ({ mousePosition }) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    "Hey! Excited to be your smartest AI engineer! 🚀",
    "Ready to 10x your social media growth?",
    "Let's transform your brand together!",
    "I never sleep, so your growth never stops! ⚡"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100%', height: '700px', position: 'relative' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
      >
        <Scene mousePosition={mousePosition} />
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
      </Canvas>
      
      {/* Premium Animated Speech Bubble */}
      <AnimatedSpeechBubble message={messages[messageIndex]} />
    </div>
  );
};

export default Professional3DRobot;
