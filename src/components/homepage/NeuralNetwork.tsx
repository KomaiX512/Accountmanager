import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

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
  const brainCoreRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Enhanced scene setup
    sceneRef.current = new THREE.Scene();
    sceneRef.current.fog = new THREE.FogExp2(0x0a0a1a, 0.002);
    
    // Professional camera setup
    const aspect = window.innerWidth / window.innerHeight;
    cameraRef.current = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    cameraRef.current.position.set(0, 0, 80);

    // High-quality renderer
    rendererRef.current = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    rendererRef.current.setClearColor(0x000000, 0);
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current.toneMappingExposure = 1.2;
    containerRef.current.appendChild(rendererRef.current.domElement);

    // Professional lighting setup
    setupLighting();
    
    // Create the enhanced neural network
    createBrainCore();
    createNeuralLayers();
    createSynapticConnections();
    createNeuralParticles();
    createDataStreams();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Professional animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      const time = Date.now() * 0.0008;
      const slowTime = time * 0.3;

      // Subtle scene breathing effect
      sceneRef.current.rotation.y = Math.sin(time * 0.1) * 0.02;
      sceneRef.current.rotation.x = Math.cos(time * 0.15) * 0.01;

      // Animate brain core
      if (brainCoreRef.current) {
        brainCoreRef.current.rotation.y += 0.002;
        brainCoreRef.current.rotation.x = Math.sin(slowTime) * 0.1;
        
        brainCoreRef.current.children.forEach((child, index) => {
          if (child instanceof THREE.Mesh) {
            const pulse = Math.sin(time * 2 + index * 0.5) * 0.3 + 1;
            child.scale.setScalar(pulse);
            
            if (child.material instanceof THREE.MeshPhongMaterial) {
              child.material.emissiveIntensity = 0.2 + Math.sin(time * 3 + index) * 0.1;
            }
          }
        });
      }

      // Enhanced node animations
      nodesRef.current.forEach((node, index) => {
        const originalPos = node.userData.originalPosition;
        const layerIndex = node.userData.layerIndex;
        const nodeIndex = node.userData.nodeIndex;
        
        // Organic wave motion
        const waveX = Math.sin(time * 0.5 + layerIndex * 0.3 + nodeIndex * 0.1) * 2;
        const waveY = Math.cos(time * 0.7 + layerIndex * 0.2 + nodeIndex * 0.15) * 1.5;
        const waveZ = Math.sin(time * 0.3 + layerIndex * 0.4 + nodeIndex * 0.2) * 1;
        
        node.position.x = originalPos.x + waveX;
        node.position.y = originalPos.y + waveY;
        node.position.z = originalPos.z + waveZ;
        
        // Mouse interaction with depth
        const mouseInfluence = 2 + layerIndex * 0.5;
        node.position.x += mouseX * mouseInfluence;
        node.position.y += mouseY * mouseInfluence;
        
        // Neural activation pulse
        const activation = Math.sin(time * 4 + nodeIndex * 0.2) * 0.5 + 0.5;
        const scale = 0.8 + activation * 0.6;
        node.scale.setScalar(scale);
        
        // Dynamic material properties
        if (node.material instanceof THREE.MeshPhongMaterial) {
          node.material.emissiveIntensity = activation * 0.8;
          node.material.opacity = 0.7 + activation * 0.3;
          
          // Color shifting based on activity
          const hue = (time * 0.1 + nodeIndex * 0.05) % 1;
          node.material.color.setHSL(
            0.5 + Math.sin(hue * Math.PI * 2) * 0.2,
            0.8,
            0.4 + activation * 0.4
          );
        }
      });

      // Enhanced synaptic connections
      connectionsRef.current.forEach((connection, index) => {
        const startNode = connection.userData.startNode;
        const endNode = connection.userData.endNode;
        
        // Update connection geometry
        const points = [startNode.position, endNode.position];
        connection.geometry.setFromPoints(points);
        
        // Synaptic transmission effect
        const distance = startNode.position.distanceTo(endNode.position);
        const transmission = Math.sin(time * 6 + index * 0.3 - distance * 0.1) * 0.5 + 0.5;
        
        if (connection.material instanceof THREE.LineBasicMaterial) {
          const baseOpacity = Math.max(0.1, 1 - distance / 60);
          connection.material.opacity = baseOpacity * transmission * 0.6;
          
          // Electric blue to cyan gradient
          const intensity = transmission * 0.8 + 0.2;
          connection.material.color.setHSL(0.55, 0.9, intensity);
        }
      });

      // Animate neural particles
      if (particlesRef.current) {
        particlesRef.current.rotation.y += 0.0003;
        
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        const colors = particlesRef.current.geometry.attributes.color.array as Float32Array;
        
        for (let i = 0; i < positions.length; i += 3) {
          // Floating motion
          positions[i + 1] += Math.sin(time + i * 0.01) * 0.008;
          positions[i] += Math.cos(time * 0.7 + i * 0.01) * 0.005;
          
          // Color pulsing
          const pulse = Math.sin(time * 2 + i * 0.05) * 0.5 + 0.5;
          colors[i] = 0.2 + pulse * 0.8;     // R
          colors[i + 1] = 0.8 + pulse * 0.2; // G
          colors[i + 2] = 0.9 + pulse * 0.1; // B
        }
        
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
        particlesRef.current.geometry.attributes.color.needsUpdate = true;
      }

      // Cinematic camera movement
      const cameraRadius = 1.5;
      cameraRef.current.position.x = Math.sin(time * 0.05) * cameraRadius;
      cameraRef.current.position.y = Math.cos(time * 0.07) * cameraRadius;
      cameraRef.current.lookAt(0, 0, 0);

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameRef.current);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      
      // Cleanup
      cleanup();
    };
  }, []);

  const setupLighting = () => {
    if (!sceneRef.current) return;

    // Ambient lighting for overall illumination
    const ambientLight = new THREE.AmbientLight(0x1a1a3a, 0.4);
    sceneRef.current.add(ambientLight);

    // Key light - cyan
    const keyLight = new THREE.DirectionalLight(0x00ffcc, 1.2);
    keyLight.position.set(50, 50, 50);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    sceneRef.current.add(keyLight);

    // Fill light - blue
    const fillLight = new THREE.DirectionalLight(0x007bff, 0.8);
    fillLight.position.set(-30, 20, 30);
    sceneRef.current.add(fillLight);

    // Rim light - purple
    const rimLight = new THREE.DirectionalLight(0x6a5acd, 0.6);
    rimLight.position.set(0, -50, -50);
    sceneRef.current.add(rimLight);

    // Point lights for neural activity
    for (let i = 0; i < 5; i++) {
      const pointLight = new THREE.PointLight(0x00ffcc, 0.5, 100);
      pointLight.position.set(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 50
      );
      sceneRef.current.add(pointLight);
    }
  };

  const createBrainCore = () => {
    if (!sceneRef.current) return;

    brainCoreRef.current = new THREE.Group();
    
    // Central brain core with multiple layers
    for (let i = 0; i < 3; i++) {
      const coreGeometry = new THREE.SphereGeometry(2 - i * 0.5, 32, 32);
      const coreMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(0.55 + i * 0.05, 0.8, 0.3),
        transparent: true,
        opacity: 0.6 - i * 0.1,
        emissive: new THREE.Color().setHSL(0.55 + i * 0.05, 0.8, 0.1),
        shininess: 100
      });
      
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      brainCoreRef.current.add(core);
    }
    
    sceneRef.current.add(brainCoreRef.current);
  };

  const createNeuralLayers = () => {
    if (!sceneRef.current) return;

    const layerCount = 6;
    const nodeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    
    for (let layer = 0; layer < layerCount; layer++) {
      const nodesInLayer = 8 + layer * 2;
      const layerRadius = 15 + layer * 8;
      
      for (let node = 0; node < nodesInLayer; node++) {
        // Enhanced material with better lighting
        const nodeMaterial = new THREE.MeshPhongMaterial({
          color: new THREE.Color().setHSL(0.5 + layer * 0.05, 0.8, 0.4),
          transparent: true,
          opacity: 0.8,
          emissive: new THREE.Color().setHSL(0.5 + layer * 0.05, 0.8, 0.1),
          shininess: 50,
          specular: 0x444444
        });
        
        const neuron = new THREE.Mesh(nodeGeometry, nodeMaterial);
        
        // Sophisticated positioning
        const angle = (node / nodesInLayer) * Math.PI * 2;
        const heightVariation = (Math.random() - 0.5) * 10;
        const radiusVariation = layerRadius + (Math.random() - 0.5) * 5;
        
        const position = new THREE.Vector3(
          Math.cos(angle) * radiusVariation,
          heightVariation,
          Math.sin(angle) * radiusVariation
        );
        
        neuron.position.copy(position);
        neuron.userData = {
          originalPosition: position.clone(),
          layerIndex: layer,
          nodeIndex: node,
          activationPhase: Math.random() * Math.PI * 2
        };
        
        sceneRef.current.add(neuron);
        nodesRef.current.push(neuron);
      }
    }
  };

  const createSynapticConnections = () => {
    if (!sceneRef.current) return;

    // Create intelligent connections based on proximity and layer relationships
    for (let i = 0; i < nodesRef.current.length; i++) {
      const nodeA = nodesRef.current[i];
      
      for (let j = i + 1; j < nodesRef.current.length; j++) {
        const nodeB = nodesRef.current[j];
        const distance = nodeA.position.distanceTo(nodeB.position);
        
        // Layer-based connection probability
        const layerDiff = Math.abs(nodeA.userData.layerIndex - nodeB.userData.layerIndex);
        const connectionProbability = Math.max(0, 1 - distance / 40) * (1 - layerDiff * 0.2);
        
        if (Math.random() < connectionProbability * 0.4) {
          const points = [nodeA.position.clone(), nodeB.position.clone()];
          const connectionGeometry = new THREE.BufferGeometry().setFromPoints(points);
          
          const connectionMaterial = new THREE.LineBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.3,
            linewidth: 1
          });
          
          const connection = new THREE.Line(connectionGeometry, connectionMaterial);
          connection.userData = {
            startNode: nodeA,
            endNode: nodeB,
            transmissionPhase: Math.random() * Math.PI * 2
          };
          
          sceneRef.current.add(connection);
          connectionsRef.current.push(connection);
        }
      }
    }
  };

  const createNeuralParticles = () => {
    if (!sceneRef.current) return;

    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      // Distribute particles in a neural cloud pattern
      const radius = 20 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Varied particle colors
      colors[i * 3] = 0.2 + Math.random() * 0.8;     // R
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.2; // G
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1; // B
    }
    
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    
    particlesRef.current = new THREE.Points(particleGeometry, particleMaterial);
    sceneRef.current.add(particlesRef.current);
  };

  const createDataStreams = () => {
    if (!sceneRef.current) return;

    // Create flowing data streams between neural layers
    for (let i = 0; i < 10; i++) {
      const streamGeometry = new THREE.CylinderGeometry(0.02, 0.02, 50, 8);
      const streamMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.4,
        emissive: 0x003333
      });
      
      const stream = new THREE.Mesh(streamGeometry, streamMaterial);
      stream.position.set(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 50
      );
      stream.rotation.z = Math.random() * Math.PI * 2;
      
      sceneRef.current.add(stream);
    }
  };

  const cleanup = () => {
    // Dispose of all geometries and materials
    nodesRef.current.forEach(node => {
      node.geometry.dispose();
      if (node.material instanceof THREE.Material) {
        node.material.dispose();
      }
    });
    
    connectionsRef.current.forEach(connection => {
      connection.geometry.dispose();
      if (connection.material instanceof THREE.Material) {
        connection.material.dispose();
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
        background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000008 100%)'
      }} 
    />
  );
};

export default NeuralNetwork; 