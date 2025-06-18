import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './NeuralNetworkCSS.css';

interface NeuralNetworkProps {
  mouseX: number;
  mouseY: number;
}

const NeuralNetwork: React.FC<NeuralNetworkProps> = ({ mouseX, mouseY }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesRef = useRef<THREE.Mesh[]>([]);
  const connectionsRef = useRef<THREE.Line[]>([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [performanceMode, setPerformanceMode] = useState<'high' | 'medium' | 'low' | 'css'>('medium');
  const [useCSSFallback, setUseCSSFallback] = useState(false);
  
  // Performance monitoring
  const frameCountRef = useRef(0);
  const lastFPSCheckRef = useRef(Date.now());
  const lowFPSCountRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Check device capabilities for auto-fallback
    const checkDeviceCapabilities = () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        setUseCSSFallback(true);
        return;
      }
      
      // Check for low-end devices
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isLowMemory = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
      
      if (isMobile || isLowMemory) {
        setPerformanceMode('low');
      }
    };

    checkDeviceCapabilities();

    if (useCSSFallback) return; // Skip WebGL initialization for CSS fallback

    // Performance-optimized scene setup
    sceneRef.current = new THREE.Scene();
    
    // Lightweight camera setup
    const aspect = window.innerWidth / window.innerHeight;
    cameraRef.current = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    cameraRef.current.position.set(0, 0, 60);

    // Performance-optimized renderer
    rendererRef.current = new THREE.WebGLRenderer({ 
      antialias: false, // Disabled for performance
      alpha: true,
      powerPreference: "low-power", // Changed to low-power
      preserveDrawingBuffer: false // Disabled for performance
    });
    rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Reduced pixel ratio
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current.setClearColor(0x000000, 0);
    // Removed shadow mapping for performance
    containerRef.current.appendChild(rendererRef.current.domElement);

    // Minimal lighting setup
    setupOptimizedLighting();
    
    // Create optimized neural network
    createOptimizedNodes();
    createOptimizedConnections();
    createOptimizedParticles();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    // Visibility API for power saving
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Optimized animation loop with FPS throttling
    let animationId: number;
    let lastFrameTime = 0;
    const targetFPS = performanceMode === 'low' ? 20 : 30; // Even lower for low mode
    const frameInterval = 1000 / targetFPS;
    
    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate);
      
      // Skip frames if not visible
      if (!isVisible) return;
      
      // FPS throttling
      if (currentTime - lastFrameTime < frameInterval) return;
      lastFrameTime = currentTime;
      
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) {
        cancelAnimationFrame(animationId);
        return;
      }

      // Performance monitoring with CSS fallback trigger
      frameCountRef.current++;
      if (frameCountRef.current % 60 === 0) {
        const now = Date.now();
        const fps = 60000 / (now - lastFPSCheckRef.current);
        lastFPSCheckRef.current = now;
        
        // Auto-adjust performance mode
        if (fps < 15) {
          lowFPSCountRef.current++;
          if (lowFPSCountRef.current > 3) {
            setUseCSSFallback(true); // Switch to CSS fallback
            return;
          }
          setPerformanceMode('css');
        } else if (fps < 20) {
          setPerformanceMode('low');
        } else if (fps < 40) {
          setPerformanceMode('medium');
        } else {
          setPerformanceMode('high');
          lowFPSCountRef.current = 0;
        }
      }

      const time = Date.now() * 0.0005; // Slower animation for less processing

      // Simplified scene rotation
      if (performanceMode !== 'low' && performanceMode !== 'css') {
        sceneRef.current.rotation.y = Math.sin(time * 0.1) * 0.01;
      }

      // Optimized node animations (reduced frequency)
      const updateFrequency = performanceMode === 'low' ? 4 : 2;
      if (frameCountRef.current % updateFrequency === 0) {
        nodesRef.current.forEach((node, index) => {
          if (!node.userData) return;
          
          const originalPos = node.userData.originalPosition;
          const layerIndex = node.userData.layerIndex;
          const nodeIndex = node.userData.nodeIndex;
          
          if (!originalPos) return;
          
          // Simplified wave motion
          const wave = Math.sin(time + layerIndex + nodeIndex * 0.5);
          node.position.x = originalPos.x + wave * 1.5;
          node.position.y = originalPos.y + Math.cos(time * 0.8 + nodeIndex) * 1;
          node.position.z = originalPos.z;
          
          // Mouse interaction (reduced influence)
          node.position.x += mouseX * 0.5;
          node.position.y += mouseY * 0.5;
          
          // Simplified activation
          const activation = Math.sin(time * 2 + nodeIndex) * 0.5 + 0.5;
          node.scale.setScalar(0.8 + activation * 0.4);
          
          // Optimized material updates (less frequent)
          if (performanceMode === 'high' && node.material instanceof THREE.MeshBasicMaterial) {
            node.material.opacity = 0.6 + activation * 0.3;
          }
        });
      }

      // Optimized connections (update less frequently)
      const connectionUpdateFrequency = performanceMode === 'low' ? 6 : 3;
      if (frameCountRef.current % connectionUpdateFrequency === 0 && performanceMode !== 'low' && performanceMode !== 'css') {
        connectionsRef.current.forEach((connection, index) => {
          if (!connection.userData) return;
          
          const startNode = connection.userData.startNode;
          const endNode = connection.userData.endNode;
          
          if (!startNode || !endNode) return;
          
          const points = [startNode.position, endNode.position];
          connection.geometry.setFromPoints(points);
          
          if (connection.material instanceof THREE.LineBasicMaterial) {
            const transmission = Math.sin(time * 3 + index) * 0.5 + 0.5;
            connection.material.opacity = transmission * 0.4;
          }
        });
      }

      // Optimized particles (reduced frequency)
      const particleUpdateFrequency = performanceMode === 'low' ? 8 : 4;
      if (particlesRef.current && frameCountRef.current % particleUpdateFrequency === 0) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        
        const skipAmount = performanceMode === 'low' ? 15 : 9;
        for (let i = 0; i < positions.length; i += skipAmount) {
          positions[i + 1] += Math.sin(time + i * 0.1) * 0.005;
          positions[i] += Math.cos(time * 0.5 + i * 0.1) * 0.003;
        }
        
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Simplified camera movement
      if (performanceMode === 'high') {
        cameraRef.current.position.x = Math.sin(time * 0.02) * 0.5;
        cameraRef.current.position.y = Math.cos(time * 0.03) * 0.3;
        cameraRef.current.lookAt(0, 0, 0);
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate(0);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      if (rendererRef.current && containerRef.current && containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      
      cleanup();
    };
  }, [mouseX, mouseY, isVisible, useCSSFallback]);

  const setupOptimizedLighting = () => {
    if (!sceneRef.current) return;

    // Minimal lighting setup for performance
    const ambientLight = new THREE.AmbientLight(0x1a1a3a, 0.6);
    sceneRef.current.add(ambientLight);

    // Single directional light instead of multiple
    const mainLight = new THREE.DirectionalLight(0x00ffcc, 0.8);
    mainLight.position.set(30, 30, 30);
    sceneRef.current.add(mainLight);
  };

  const createOptimizedNodes = () => {
    if (!sceneRef.current) return;

    // Reduced number of layers and nodes for performance
    const layerCount = 4; // Reduced from 6
    const nodeGeometry = new THREE.SphereGeometry(0.12, 8, 8); // Reduced geometry detail
    
    for (let layer = 0; layer < layerCount; layer++) {
      const nodesInLayer = 6 + layer; // Reduced nodes per layer
      const layerRadius = 12 + layer * 6;
      
      for (let node = 0; node < nodesInLayer; node++) {
        // Use MeshBasicMaterial for better performance
        const nodeMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.5 + layer * 0.1, 0.8, 0.5),
          transparent: true,
          opacity: 0.7
        });
        
        const neuron = new THREE.Mesh(nodeGeometry, nodeMaterial);
        
        const angle = (node / nodesInLayer) * Math.PI * 2;
        const heightVariation = (Math.random() - 0.5) * 6;
        
        const position = new THREE.Vector3(
          Math.cos(angle) * layerRadius,
          heightVariation,
          Math.sin(angle) * layerRadius
        );
        
        neuron.position.copy(position);
        neuron.userData = {
          originalPosition: position.clone(),
          layerIndex: layer,
          nodeIndex: node
        };
        
        sceneRef.current.add(neuron);
        nodesRef.current.push(neuron);
      }
    }
  };

  const createOptimizedConnections = () => {
    if (!sceneRef.current) return;

    // Reduced number of connections for performance
    for (let i = 0; i < nodesRef.current.length; i += 2) { // Skip every other node
      const nodeA = nodesRef.current[i];
      
      for (let j = i + 2; j < nodesRef.current.length; j += 3) { // Skip more nodes
        const nodeB = nodesRef.current[j];
        const distance = nodeA.position.distanceTo(nodeB.position);
        
        if (distance < 25 && Math.random() < 0.3) { // Reduced connection probability
          const points = [nodeA.position.clone(), nodeB.position.clone()];
          const connectionGeometry = new THREE.BufferGeometry().setFromPoints(points);
          
          const connectionMaterial = new THREE.LineBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.2
          });
          
          const connection = new THREE.Line(connectionGeometry, connectionMaterial);
          connection.userData = {
            startNode: nodeA,
            endNode: nodeB
          };
          
          sceneRef.current.add(connection);
          connectionsRef.current.push(connection);
        }
      }
    }
  };

  const createOptimizedParticles = () => {
    if (!sceneRef.current) return;

    // Reduced particle count for performance
    const particleCount = 100; // Reduced from 300
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const radius = 15 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.2,
      transparent: true,
      opacity: 0.4,
      color: 0x00ffcc,
      sizeAttenuation: false // Better performance
    });
    
    particlesRef.current = new THREE.Points(particleGeometry, particleMaterial);
    sceneRef.current.add(particlesRef.current);
  };

  const cleanup = () => {
    // Efficient cleanup
    [...nodesRef.current, ...connectionsRef.current].forEach(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    if (particlesRef.current) {
      particlesRef.current.geometry.dispose();
      if (particlesRef.current.material instanceof THREE.Material) {
        particlesRef.current.material.dispose();
      }
    }
    
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
  };

  // CSS Fallback Component
  const CSSNeuralNetwork = () => (
    <div className="css-neural-network">
      <div className="css-neural-background"></div>
      <div className="css-neural-nodes">
        {[...Array(20)].map((_, i) => (
          <div 
            key={i} 
            className="css-neural-node" 
            style={{
              '--delay': `${i * 0.1}s`,
              '--x': `${Math.cos((i / 20) * Math.PI * 2) * 40 + 50}%`,
              '--y': `${Math.sin((i / 20) * Math.PI * 2) * 40 + 50}%`,
              transform: `translate(${mouseX * 10}px, ${mouseY * 10}px)`
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="css-neural-particles">
        {[...Array(30)].map((_, i) => (
          <div 
            key={i} 
            className="css-neural-particle" 
            style={{
              '--delay': `${i * 0.2}s`,
              '--duration': `${3 + Math.random() * 2}s`
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );

  if (useCSSFallback) {
    return (
      <div 
        ref={containerRef} 
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000008 100%)',
          opacity: isVisible ? 1 : 0.3
        }}
      >
        <CSSNeuralNetwork />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000008 100%)',
        opacity: isVisible ? 1 : 0.3 // Reduce opacity when not visible
      }} 
    />
  );
};

export default NeuralNetwork; 