import { useEffect, useState, useCallback } from 'react';
import backgroundImage from '@/assets/background.jpg';

interface MousePosition {
  x: number;
  y: number;
}

interface BackgroundLayerProps {
  children: React.ReactNode;
  onMouseMove?: (position: MousePosition) => void;
}

export function BackgroundLayer({ children, onMouseMove }: BackgroundLayerProps) {
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0.5, y: 0.5 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    setMousePosition({ x, y });
    onMouseMove?.({ x, y });
  }, [onMouseMove]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Calculate parallax offset (subtle movement)
  const offsetX = (mousePosition.x - 0.5) * 30;
  const offsetY = (mousePosition.y - 0.5) * 30;

  return (
    <div className="relative min-h-screen">
      {/* Fixed background image with parallax - doesn't block scrolling */}
      <div 
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ overflow: 'hidden' }}
      >
        <div 
          className="absolute inset-[-60px] transition-transform duration-500 ease-out"
          style={{
            transform: `translate(${offsetX}px, ${offsetY}px) scale(1.1)`,
          }}
        >
          {/* Background image */}
          <img
            src={backgroundImage}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'brightness(0.7)',
            }}
          />
          
        {/* Subtle dark overlay for better contrast */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.25))',
          }}
        />
        </div>
      </div>

      {/* Content layer - normal flow, allows scrolling */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export default BackgroundLayer;
