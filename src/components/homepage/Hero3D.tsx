import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, ContactShadows, Environment } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';

interface AnimatedSphereProps {
  mousePosition: { x: number; y: number };
}

function AnimatedSphere({ mousePosition }: AnimatedSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = mousePosition.y * 0.2;
      meshRef.current.rotation.y = mousePosition.x * 0.2;
      
      // Floating animation
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.2;
    }
    
    if (lightRef.current) {
      lightRef.current.position.x = mousePosition.x * 5;
      lightRef.current.position.y = mousePosition.y * 5;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight ref={lightRef} position={[10, 10, 10]} intensity={2} color="#00ffcc" />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#0099ff" />
      
      <Sphere ref={meshRef} args={[1.5, 64, 64]} position={[0, 0, 0]}>
        <MeshDistortMaterial
          color="#00ffcc"
          attach="material"
          distort={0.5}
          speed={2}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>
      
      <ContactShadows
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -2, 0]}
        opacity={0.4}
        width={10}
        height={10}
        blur={2}
        far={4}
      />
      
      <Environment preset="city" />
    </>
  );
}

interface Hero3DProps {
  mousePosition: { x: number; y: number };
}

const Hero3D: React.FC<Hero3DProps> = ({ mousePosition }) => {
  return (
    <div className="hero-3d-container">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <Suspense fallback={null}>
          <AnimatedSphere mousePosition={mousePosition} />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Suspense>
      </Canvas>
      
      <motion.div 
        className="hero-3d-content"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
      >
        <h1 className="hero-3d-title">
          <span className="text-gradient">AI Marketing Manager</span>
        </h1>
        <p className="hero-3d-subtitle">
          Your Sentient Social Media Expert That Never Sleeps
        </p>
        <motion.button
          className="hero-3d-cta"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Acquire Your AI Manager
        </motion.button>
      </motion.div>
    </div>
  );
};

export default Hero3D;
