import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Sphere, Media } from '@/lib/types';
import { SCALE_CONFIG } from './PalaceViewer3D';

interface MediaSphereProps {
  sphere: Sphere;
  media?: Media;
}

// Seeded random for consistent wiggle per sphere
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12345.6789) * 43758.5453;
  return x - Math.floor(x);
}

// Max rotation angle in radians (about 60 degrees at screen edge - very obvious)
const MAX_Y_ROTATION = 1.05;

export function MediaSphere({ sphere, media }: MediaSphereProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();
  const [screenX, setScreenX] = useState(0);

  // Calculate screen-space X position of the sphere
  useEffect(() => {
    const worldPos = new THREE.Vector3(sphere.position.x, sphere.position.y, sphere.position.z);
    const screenPos = worldPos.clone().project(camera);
    // screenPos.x is in range [-1, 1], where -1 is left edge, 1 is right edge
    setScreenX(screenPos.x);
    
    console.log(`[MediaSphere ${sphere.description || sphere.id}] World X: ${sphere.position.x.toFixed(2)}, Screen X: ${screenPos.x.toFixed(2)}`);
  }, [sphere.position.x, sphere.position.y, sphere.position.z, camera, size, sphere.description, sphere.id]);

  // Generate consistent random factor for this sphere (10% variation)
  const randomFactor = useMemo(() => {
    const seed = sphere.position.x * 100 + sphere.position.y * 10 + sphere.position.z;
    // Random factor between 0.9 and 1.1 (±10%)
    return 0.9 + seededRandom(seed + 10) * 0.2;
  }, [sphere.position.x, sphere.position.y, sphere.position.z]);

  // Generate CSS rotation for media window
  // Y rotation includes position-based rotation: left = counter-clockwise, right = clockwise
  const { cssRotateY, wiggleRotation } = useMemo(() => {
    const seed = sphere.position.x * 100 + sphere.position.y * 10 + sphere.position.z;
    const baseWiggleY = (seededRandom(seed + 1) - 0.5) * 0.2;
    
    // Position-based Y rotation: screenX ranges from -1 (left) to 1 (right)
    // Left side (negative screenX) -> positive rotation (clockwise)
    // Right side (positive screenX) -> negative rotation (counter-clockwise)
    const positionBasedY = -screenX * MAX_Y_ROTATION * randomFactor;
    
    const finalYRotation = baseWiggleY + positionBasedY;
    const finalYDegrees = (finalYRotation * 180) / Math.PI;
    
    console.log(`[MediaSphere ${sphere.description || 'unnamed'}] screenX: ${screenX.toFixed(2)}, positionBasedY: ${positionBasedY.toFixed(3)} rad, finalY: ${finalYDegrees.toFixed(1)}°, randomFactor: ${randomFactor.toFixed(2)}`);
    
    return {
      cssRotateY: finalYDegrees,
      wiggleRotation: [
        (seededRandom(seed) - 0.5) * 0.15,     // X rotation wiggle (for 3D group)
        0,                                      // Y handled by CSS
        0
      ] as [number, number, number]
    };
  }, [sphere.position.x, sphere.position.y, sphere.position.z, screenX, randomFactor, sphere.description]);

  // Calculate aspect ratio from media dimensions
  const { cardWidth, cardHeight } = useMemo(() => {
    const baseWidth = SCALE_CONFIG.mediaWindowWidth;
    if (media?.width && media?.height) {
      const aspectRatio = media.width / media.height;
      return {
        cardWidth: baseWidth,
        cardHeight: baseWidth / aspectRatio,
      };
    }
    // Default to 16:9 if no dimensions available
    return {
      cardWidth: baseWidth,
      cardHeight: baseWidth / (16 / 9),
    };
  }, [media?.width, media?.height]);

  // Subtle floating animation
  useFrame((state) => {
    if (sphereRef.current) {
      const time = state.clock.elapsedTime;
      sphereRef.current.position.y = Math.sin(time * 0.5 + sphere.position.x) * 0.01;
    }
  });

  const position: [number, number, number] = [
    sphere.position.x,
    sphere.position.y,
    sphere.position.z,
  ];

  // Use consistent gaps from SCALE_CONFIG
  const mediaGap = SCALE_CONFIG.mediaGap;
  const labelGap = SCALE_CONFIG.labelGap;

  return (
    <group ref={groupRef} position={position}>
      {/* Simple small white sphere - acts as the node point */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[SCALE_CONFIG.sphereRadius, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Media preview window - positioned below the sphere */}
      {media && (
        <Billboard
          follow={true}
          lockX={false}
          lockY={true}
          lockZ={false}
          position={[0, -(SCALE_CONFIG.sphereRadius + mediaGap), 0]}
        >
          {/* Apply position-based Y rotation + wiggle (Y is locked on Billboard so this takes effect) */}
          <group rotation={wiggleRotation}>
            <Html
              center
              distanceFactor={1.2}
              style={{
                pointerEvents: 'none',
                perspective: '1000px',
              }}
            >
              {/* Offset down by half the height so top edge aligns with the position */}
              {/* Apply Y rotation via CSS transform for visible effect */}
              <div
                style={{
                  width: `${cardWidth}px`,
                  pointerEvents: 'none',
                  transform: `translateY(${cardHeight / 2}px) rotateY(${cssRotateY}deg)`,
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Media thumbnail with rounded corners */}
                <div
                  style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'rgba(0, 0, 0, 0.3)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {media.thumbnailUrl ? (
                    <img
                      src={media.thumbnailUrl}
                      alt={media.filename}
                      style={{
                        width: `${cardWidth}px`,
                        height: `${cardHeight}px`,
                        objectFit: 'contain',
                        display: 'block',
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: `${cardWidth}px`,
                        height: `${cardHeight}px`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '16px' }}>
                        {media.type === 'video' ? '▶' : media.type === 'image' ? '◻' : '◇'}
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '7px', marginTop: '3px' }}>
                        No thumbnail
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Html>
          </group>
        </Billboard>
      )}

      {/* Sphere description label - positioned above sphere */}
      {/* Bottom of text should be at same distance from sphere as top of media */}
      {sphere.description && (
        <Billboard 
          follow={true} 
          lockX={false} 
          lockY={false} 
          lockZ={false} 
          position={[0, SCALE_CONFIG.sphereRadius + labelGap, 0]}
        >
          <Html center distanceFactor={1.2} style={{ pointerEvents: 'none' }}>
            {/* Transform up so bottom of text aligns with the position point */}
            <div
              style={{
                transform: 'translateY(-50%)',
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '8px',
                fontWeight: '500',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
              }}
            >
              {sphere.description}
            </div>
          </Html>
        </Billboard>
      )}
    </group>
  );
}

export default MediaSphere;
