import { useMemo } from 'react';
import * as THREE from 'three';
import { SCALE_CONFIG } from './PalaceViewer3D';

interface BezierConnectionProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  segments?: number;
}

// Seeded random for consistent control points
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

// Sample cubic bezier curve at parameter t
function sampleBezierCurve(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const point = new THREE.Vector3();
  point.addScaledVector(p0, uuu);
  point.addScaledVector(p1, 3 * uu * t);
  point.addScaledVector(p2, 3 * u * tt);
  point.addScaledVector(p3, ttt);

  return point;
}

// Generate control points with organic randomness (based on Unity implementation)
function generateControlPoints(
  start: THREE.Vector3,
  end: THREE.Vector3
): { cp1: THREE.Vector3; cp2: THREE.Vector3 } {
  const direction = new THREE.Vector3().subVectors(end, start);
  const distance = direction.length();
  
  // Seed based on positions for consistent results
  const seed = start.x * 1000 + start.y * 100 + start.z * 10 + end.x + end.y * 0.1 + end.z * 0.01;
  
  // Random factors for organic curves (matching Unity's randomAngle 8-28 degrees)
  const randomAngle = 8 + seededRandom(seed) * 20; // degrees
  const randomRotation = seededRandom(seed + 1) * 360; // degrees
  const cpLengthFactor = 1.5 + seededRandom(seed + 2) * 2.5; // 1.5-4.0
  
  // Convert to radians
  const angleRad = (randomAngle * Math.PI) / 180;
  const rotationRad = (randomRotation * Math.PI) / 180;
  
  const cpLength = distance / cpLengthFactor;
  
  // Create control point vectors with rotation
  const dirNorm = direction.clone().normalize();
  
  // Calculate perpendicular vectors
  const up = new THREE.Vector3(0, 1, 0);
  let perpendicular = new THREE.Vector3().crossVectors(dirNorm, up).normalize();
  
  if (perpendicular.length() < 0.1) {
    perpendicular = new THREE.Vector3(1, 0, 0);
  }
  
  const side = new THREE.Vector3().crossVectors(perpendicular, dirNorm).normalize();
  
  // Apply rotation to get varied control points
  const offsetX = Math.cos(rotationRad) * Math.sin(angleRad) * cpLength;
  const offsetY = Math.sin(rotationRad) * Math.sin(angleRad) * cpLength;
  const offsetZ = Math.cos(angleRad) * cpLength;
  
  const cp1 = start.clone()
    .addScaledVector(dirNorm, offsetZ)
    .addScaledVector(perpendicular, offsetX)
    .addScaledVector(side, offsetY);
  
  // Second control point with different rotation
  const randomRotation2 = seededRandom(seed + 3) * 360;
  const rotationRad2 = (randomRotation2 * Math.PI) / 180;
  const offsetX2 = Math.cos(rotationRad2) * Math.sin(angleRad) * cpLength;
  const offsetY2 = Math.sin(rotationRad2) * Math.sin(angleRad) * cpLength;
  
  const cp2 = end.clone()
    .addScaledVector(dirNorm.negate(), offsetZ)
    .addScaledVector(perpendicular, offsetX2)
    .addScaledVector(side, offsetY2);
  
  return { cp1, cp2 };
}

// Calculate line widths that taper at both ends (0 at start/end, peak in middle)
function calculateLineWidths(segments: number, baseWidth: number): number[] {
  const widths: number[] = [];
  widths.push(0); // Start at 0
  
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    // Smooth sine-based taper: 0 at ends, peak at middle
    const width = Math.sin(t * Math.PI) * baseWidth;
    widths.push(width);
  }
  
  widths.push(0); // End at 0
  return widths;
}

// Create ribbon geometry with variable widths (camera-facing quads)
function createTaperingRibbonGeometry(
  points: THREE.Vector3[],
  widths: number[],
  _camera: THREE.Vector3
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const width = widths[i];
    
    // Calculate direction for this segment
    let tangent: THREE.Vector3;
    if (i === 0) {
      tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (i === points.length - 1) {
      tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();
    }
    
    // Calculate perpendicular vector (cross with up for horizontal ribbon)
    const up = new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    
    if (side.length() < 0.1) {
      side = new THREE.Vector3(1, 0, 0);
    }
    
    // Create two vertices at this point (one on each side)
    const halfWidth = width / 2;
    
    // Horizontal ribbon
    vertices.push(
      point.x + side.x * halfWidth,
      point.y + side.y * halfWidth,
      point.z + side.z * halfWidth
    );
    vertices.push(
      point.x - side.x * halfWidth,
      point.y - side.y * halfWidth,
      point.z - side.z * halfWidth
    );
    
    // UVs
    const u = i / (points.length - 1);
    uvs.push(u, 0);
    uvs.push(u, 1);
  }
  
  // Create triangles connecting the strips
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    
    // Two triangles for the quad
    indices.push(a, b, c);
    indices.push(b, d, c);
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  return geometry;
}

export function BezierConnection({ 
  start, 
  end, 
  segments = 32 
}: BezierConnectionProps) {
  // Generate curve geometry with offset and tapering
  const geometry = useMemo(() => {
    const { cp1, cp2 } = generateControlPoints(start, end);
    
    // Calculate offset positions (gap before spheres)
    const offset = SCALE_CONFIG.connectionOffset;
    const startDirection = new THREE.Vector3().subVectors(cp1, start).normalize();
    const endDirection = new THREE.Vector3().subVectors(cp2, end).normalize();
    
    const offsetStart = start.clone().addScaledVector(startDirection, offset);
    const offsetEnd = end.clone().addScaledVector(endDirection, offset);
    
    // Sample curve points from offset positions
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(sampleBezierCurve(offsetStart, cp1, cp2, offsetEnd, t));
    }
    
    // Calculate tapering widths
    const widths = calculateLineWidths(segments, SCALE_CONFIG.connectionWidth);
    
    // Create ribbon geometry
    const ribbonGeometry = createTaperingRibbonGeometry(
      points, 
      widths, 
      new THREE.Vector3(0, 0, 5) // Default camera position
    );
    
    return ribbonGeometry;
  }, [start, end, segments]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default BezierConnection;
