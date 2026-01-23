import { useRef, useEffect, useState, useMemo, createContext, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ApiClient } from '@/lib/api';
import type { Palace, Sphere, Connection, Media } from '@/lib/types';
import { MediaSphere } from './MediaSphere';
import { BezierConnection } from './BezierConnection';
import { LiquidGlass } from '@/components/ui/LiquidGlass';

// Dynamic scaling configuration - exposed for other components to use
export const SCALE_CONFIG = {
  sphereRadius: 0.010,      // Base sphere size (reduced for less overlap)
  mediaWindowWidth: 90,     // Base media card width in pixels (smaller to reduce overlap)
  connectionWidth: 0.006,   // Base connection thickness (proportionally thinner)
  connectionOffset: 0.018,  // Gap before connection reaches sphere (proportionally smaller)
  labelGap: 0.015,          // Gap from sphere to text label (proportionally smaller)
  mediaGap: 0.015,          // Gap from sphere to media window (proportionally smaller)
  contentWidthRatio: 0.70,  // Content should occupy 70% of frame width (zoomed out more)
  contentHeightRatio: 0.85, // Content should occupy 85% of frame height
};

// FIXED horizontal FOV in degrees - this does NOT change with screen size
// This determines how much world-width is visible at a given camera distance
const FIXED_HORIZONTAL_FOV_DEG = 90;
const FIXED_HORIZONTAL_FOV_RAD = (FIXED_HORIZONTAL_FOV_DEG * Math.PI) / 180;

// Context for passing scale factors to children
export const ScaleContext = createContext({
  scaleFactor: 1.0,
  cameraDistance: 5,
});

interface PalaceViewer3DProps {
  palace: Palace;
  api: ApiClient;
  onError: (error: string) => void;
  onDataLoaded?: (sphereCount: number, connectionCount: number) => void;
}

// Compute bounding box of all sphere positions with buffer for media windows
function computeContentBounds(spheres: Sphere[]): { width: number; height: number; center: THREE.Vector3 } {
  if (spheres.length === 0) {
    return { 
      width: 2, 
      height: 2, 
      center: new THREE.Vector3(0, 0, 0) 
    };
  }
  
  const box = new THREE.Box3();
  spheres.forEach(s => {
    box.expandByPoint(new THREE.Vector3(s.position.x, s.position.y, s.position.z));
  });
  
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  
  // Add buffer for media windows and labels (proportional to smaller elements)
  const mediaBuffer = 0.15; // Extra space for media windows extending below spheres
  const labelBuffer = 0.06; // Extra space for labels above spheres
  
  return {
    width: Math.max(size.x + mediaBuffer * 2, 0.5),
    height: Math.max(size.y + mediaBuffer + labelBuffer, 0.5),
    center,
  };
}

// Calculate camera distance PURELY based on WIDTH
// Uses FIXED horizontal FOV - no aspect ratio involved!
function calculateCameraDistanceFromWidth(contentWidth: number): number {
  // At distance D, visible world width = 2 * D * tan(hfov/2)
  // We want: contentWidth = 0.85 * visibleWidth
  // So: contentWidth = 0.85 * 2 * D * tan(hfov/2)
  // Therefore: D = contentWidth / (0.85 * 2 * tan(hfov/2))
  const visibleWidthNeeded = contentWidth / SCALE_CONFIG.contentWidthRatio;
  const distance = visibleWidthNeeded / (2 * Math.tan(FIXED_HORIZONTAL_FOV_RAD / 2));
  return Math.max(distance, 0.5);
}

// Calculate required frame height so content fits at 85% of frame height
function calculateRequiredFrameHeight(
  contentHeight: number,
  cameraDistance: number,
  frameWidth: number
): number {
  // At distance D, visible world height = 2 * D * tan(vfov/2)
  // The vertical FOV depends on the frame aspect ratio and our fixed horizontal FOV
  // vfov = 2 * atan(tan(hfov/2) / aspect)
  // where aspect = frameWidth / frameHeight
  
  // We want: contentHeight = 0.85 * visibleWorldHeight
  // visibleWorldHeight = contentHeight / 0.85
  const visibleHeightNeeded = contentHeight / SCALE_CONFIG.contentHeightRatio;
  
  // visibleWorldHeight = 2 * D * tan(vfov/2)
  // tan(vfov/2) = visibleWorldHeight / (2 * D)
  const tanHalfVfov = visibleHeightNeeded / (2 * cameraDistance);
  
  // vfov = 2 * atan(tan(hfov/2) / aspect)
  // tan(vfov/2) = tan(hfov/2) / aspect
  // aspect = tan(hfov/2) / tan(vfov/2)
  const tanHalfHfov = Math.tan(FIXED_HORIZONTAL_FOV_RAD / 2);
  const requiredAspect = tanHalfHfov / tanHalfVfov;
  
  // aspect = frameWidth / frameHeight
  // frameHeight = frameWidth / aspect
  const frameHeight = frameWidth / requiredAspect;
  
  return frameHeight;
}

// Auto-framing camera with mouse parallax
function AutoFrameCamera({ spheres }: { spheres: Sphere[] }) {
  const { camera, size } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const cameraSetup = useRef<{ position: THREE.Vector3; target: THREE.Vector3; distance: number } | null>(null);
  
  // Calculate camera setup based on WIDTH only
  useEffect(() => {
    const perspCamera = camera as THREE.PerspectiveCamera;
    const bounds = computeContentBounds(spheres);
    
    // Calculate camera distance purely from WIDTH
    const distance = calculateCameraDistanceFromWidth(bounds.width);
    
    // Calculate the vertical FOV needed for this frame aspect
    const frameAspect = size.width / size.height;
    const tanHalfHfov = Math.tan(FIXED_HORIZONTAL_FOV_RAD / 2);
    const tanHalfVfov = tanHalfHfov / frameAspect;
    const vfovRad = 2 * Math.atan(tanHalfVfov);
    const vfovDeg = (vfovRad * 180) / Math.PI;
    
    // Update camera's vertical FOV to match our fixed horizontal FOV
    perspCamera.fov = vfovDeg;
    perspCamera.updateProjectionMatrix();
    
    const position = new THREE.Vector3(
      bounds.center.x,
      bounds.center.y,
      bounds.center.z + distance
    );
    
    cameraSetup.current = { position, target: bounds.center, distance };
    
    // Set initial camera position
    camera.position.copy(position);
    camera.lookAt(bounds.center);
    
  }, [spheres, camera, size]);

  // Handle mouse movement for parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame(() => {
    if (!cameraSetup.current) return;
    
    const { position: basePosition, target } = cameraSetup.current;
    
    // Smooth lerp towards mouse position (horizontal only to avoid scroll jitter)
    targetRef.current.x += (mouseRef.current.x - targetRef.current.x) * 0.03;

    // Apply subtle camera offset based on mouse (horizontal parallax only)
    const parallaxScale = Math.min(cameraSetup.current.distance * 0.1, 0.625);
    const parallaxX = targetRef.current.x * parallaxScale;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, basePosition.x + parallaxX, 0.08);
    camera.position.y = basePosition.y; // No vertical parallax
    camera.position.z = basePosition.z;

    camera.lookAt(target);
  });

  return null;
}

// Scene content
function Scene({ 
  spheres, 
  connections, 
  mediaById,
  mediaBySphereId,
  mediaByFilename,
}: { 
  spheres: Sphere[]; 
  connections: Connection[];
  mediaById: Map<string, Media>;
  mediaBySphereId: Map<string, Media>;
  mediaByFilename: Map<string, Media>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const spherePositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    spheres.forEach(sphere => {
      positions.set(sphere.id, new THREE.Vector3(
        sphere.position.x,
        sphere.position.y,
        sphere.position.z
      ));
    });
    return positions;
  }, [spheres]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.6} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ffffff" />

      <group ref={groupRef}>
        {spheres.map((sphere) => {
          let media = sphere.mediaRef ? mediaById.get(sphere.mediaRef) : undefined;
          
          if (!media && sphere.associatedFileName) {
            const filename = sphere.associatedFileName.split('/').pop() || sphere.associatedFileName;
            media = mediaByFilename.get(filename.toLowerCase());
          }
          
          if (!media) {
            media = mediaBySphereId.get(sphere.id);
          }
          
          return (
            <MediaSphere
              key={sphere.id}
              sphere={sphere}
              media={media}
            />
          );
        })}

        {connections.map((connection) => {
          const startPos = spherePositions.get(connection.startObjectId);
          const endPos = spherePositions.get(connection.endObjectId);
          
          if (!startPos || !endPos) return null;
          
          return (
            <BezierConnection
              key={connection.id}
              start={startPos}
              end={endPos}
            />
          );
        })}
      </group>

      <AutoFrameCamera spheres={spheres} />
    </>
  );
}

export function PalaceViewer3D({ palace, api, onError, onDataLoaded }: PalaceViewer3DProps) {
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mediaById, setMediaById] = useState<Map<string, Media>>(new Map());
  const [mediaBySphereId, setMediaBySphereId] = useState<Map<string, Media>>(new Map());
  const [mediaByFilename, setMediaByFilename] = useState<Map<string, Media>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [containerHeight, setContainerHeight] = useState(600);

  // Calculate container height based on WIDTH - then adjust height for content
  const calculateContainerHeight = useCallback(() => {
    if (spheres.length === 0) {
      setContainerHeight(600);
      return;
    }
    
    const bounds = computeContentBounds(spheres);
    const screenWidth = window.innerWidth;
    const frameWidth = screenWidth;
    
    const cameraDistance = calculateCameraDistanceFromWidth(bounds.width);
    const desiredFrameHeight = calculateRequiredFrameHeight(bounds.height, cameraDistance, frameWidth);
    
    const minHeight = 300;
    const finalHeight = Math.max(minHeight, desiredFrameHeight);
    
    setContainerHeight(finalHeight);
  }, [spheres]);

  // Update height on window resize
  useEffect(() => {
    calculateContainerHeight();
    window.addEventListener('resize', calculateContainerHeight);
    return () => window.removeEventListener('resize', calculateContainerHeight);
  }, [calculateContainerHeight]);

  // Fetch palace data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const spheresData = await api.getSpheres(palace.id);
        setSpheres(spheresData);

        const connectionsData = await api.getConnections(palace.id);
        setConnections(connectionsData);

        // Notify parent of data counts
        onDataLoaded?.(spheresData.length, connectionsData.length);

        const allMedia = await api.getMedia();
        const palaceMedia = allMedia.filter(m => m.palaceId === palace.id);
        
        const byId = new Map<string, Media>();
        palaceMedia.forEach(m => byId.set(m.id, m));
        setMediaById(byId);
        
        const bySphereId = new Map<string, Media>();
        palaceMedia.forEach(m => {
          if (m.sphereId) {
            bySphereId.set(m.sphereId, m);
          }
        });
        setMediaBySphereId(bySphereId);
        
        const byFilename = new Map<string, Media>();
        palaceMedia.forEach(m => {
          if (m.filename) {
            byFilename.set(m.filename.toLowerCase(), m);
          }
        });
        setMediaByFilename(byFilename);
        
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to load palace data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palace.id, api, onError]);

  if (isLoading) {
    return (
      <div 
        className="relative flex items-center justify-center"
        style={{ 
          width: '100vw',
          marginLeft: 'calc(-50vw + 50%)',
          height: '60vh' 
        }}
      >
        <div className="text-white/60 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
          <span>Loading 3D view...</span>
        </div>
      </div>
    );
  }

  if (spheres.length === 0) {
    return (
      <LiquidGlass className="w-full" cornerRadius={32} padding="48px">
        <div className="text-center text-white/60">
          <p className="text-lg mb-2">No spheres in this palace yet</p>
          <p className="text-sm text-white/40">Add media from the Vision Pro app to see them here</p>
        </div>
      </LiquidGlass>
    );
  }

  return (
    <div 
      className="relative"
      style={{
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
        height: `${containerHeight}px`,
      }}
    >
      {/* 3D Canvas */}
      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 60 }}
          style={{ background: 'transparent', pointerEvents: 'none' }}
          gl={{ alpha: true, antialias: true }}
          eventSource={undefined}
          eventPrefix="offset"
        >
          <Scene 
            spheres={spheres} 
            connections={connections} 
            mediaById={mediaById}
            mediaBySphereId={mediaBySphereId}
            mediaByFilename={mediaByFilename}
          />
        </Canvas>
      </div>
    </div>
  );
}

export default PalaceViewer3D;
