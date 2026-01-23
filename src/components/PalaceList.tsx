import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Cloudy, Save, X, Castle, Clock, Layers } from 'lucide-react';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Input } from '@/components/ui/input';
import type { Palace, Media } from '../lib/types';

interface PalaceListProps {
  palaces: Palace[];
  isLoading: boolean;
  onManagePalace: (palace: Palace) => void;
  onCreatePalace: (name: string) => void;
  onRenamePalace: (palace: Palace, newName: string) => void;
  media?: Media[]; // Optional media for thumbnails
}

// Format timestamp to relative time or date
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

export const PalaceList = ({
  palaces,
  isLoading,
  onManagePalace,
  onCreatePalace,
  onRenamePalace,
  media = []
}: PalaceListProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPalaceName, setNewPalaceName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPalaceId, setHoveredPalaceId] = useState<string | null>(null);

  // Sort palaces by lastModified (newest first)
  const sortedPalaces = useMemo(() => {
    return [...palaces].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  }, [palaces]);

  // Get first thumbnail for each palace
  const palaceThumbnails = useMemo(() => {
    const thumbnails: Record<string, string | undefined> = {};
    for (const palace of palaces) {
      const palaceMedia = media
        .filter(m => m.palaceId === palace.id && m.status === 'ready' && m.thumbnailUrl)
        .sort((a, b) => (a.uploadDate || 0) - (b.uploadDate || 0));
      if (palaceMedia.length > 0) {
        thumbnails[palace.id] = palaceMedia[0].thumbnailUrl;
      }
    }
    return thumbnails;
  }, [palaces, media]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPalaceName.trim()) {
      onCreatePalace(newPalaceName.trim());
      setNewPalaceName('');
      setIsCreating(false);
    }
  };

  const handleRenameSubmit = (palace: Palace) => {
    if (editingName.trim() && editingName !== palace.name) {
      onRenamePalace(palace, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  if (isLoading && palaces.length === 0) {
    return (
      <LiquidGlass className="w-full" cornerRadius={32} padding="32px">
        <div className="flex items-center justify-center py-8">
          <div className="text-white/60">Loading palaces...</div>
        </div>
      </LiquidGlass>
    );
  }

  return (
  <>
    <LiquidGlass className="w-full" cornerRadius={32} padding="24px">
      <div className="flex flex-row items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Mind Palaces</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-200 text-white/80 hover:text-white text-sm border border-white/10 hover:border-white/20"
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
          Create New
        </button>
      </div>

      <div className="space-y-4">
        {/* Create New Palace Form */}
        {isCreating && (
          <form onSubmit={handleCreateSubmit} className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="space-y-3">
              <Input
                placeholder="Enter palace name"
                value={newPalaceName}
                onChange={(e) => setNewPalaceName(e.target.value)}
                autoFocus
                disabled={isLoading}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPalaceName.trim() || isLoading}
                  className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm border border-white/20"
                >
                  Create
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Palaces Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sortedPalaces.map((palace) => {
            const thumbnail = palaceThumbnails[palace.id];
            
            return (
              <div
                key={palace.id}
                onClick={() => editingId !== palace.id && !isLoading && onManagePalace(palace)}
                onMouseMove={(e) => {
                  if (thumbnail && editingId !== palace.id) {
                    setMousePos({ x: e.clientX, y: e.clientY });
                    setHoveredPalaceId(palace.id);
                  }
                }}
                onMouseLeave={() => {
                  setMousePos(null);
                  setHoveredPalaceId(null);
                }}
                className={`group relative rounded-2xl p-4 bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-200 hover:bg-white/[0.07] ${
                  editingId !== palace.id ? 'cursor-pointer' : ''
                }`}
              >
                {editingId === palace.id ? (
                  // Edit Mode
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      className="flex-1"
                      disabled={isLoading}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameSubmit(palace);
                      }}
                      disabled={!editingName.trim() || isLoading}
                      className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEdit();
                      }}
                      disabled={isLoading}
                      className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center justify-between">
                    {/* Left side: Name, timestamp, edit button */}
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{palace.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(palace.id);
                            setEditingName(palace.name);
                          }}
                          disabled={isLoading}
                          className="p-1 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-all duration-200 shrink-0"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-white/40">
                        {palace.lastModified && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{formatDate(palace.lastModified)}</span>
                          </div>
                        )}
                        {palace.spheres && palace.spheres.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Layers className="h-2.5 w-2.5" />
                            <span>{palace.spheres.length} sphere{palace.spheres.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Right side: Manage Media */}
                    <div className="flex items-center gap-2 text-white/50 text-sm shrink-0 ml-4">
                      <Cloudy className="h-4 w-4" />
                      <span className="hidden sm:inline">Manage Media</span>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>

        {palaces.length === 0 && !isCreating && (
          <div className="text-center py-12 text-white/40">
            <Castle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No palaces yet. Create your first palace to get started!</p>
          </div>
        )}
      </div>
    </LiquidGlass>

    {/* Thumbnail popup - rendered via portal to avoid transform issues */}
    {hoveredPalaceId && mousePos && palaceThumbnails[hoveredPalaceId] && createPortal(
      <div 
        className="fixed w-72 z-[9999] pointer-events-none"
        style={{
          left: mousePos.x + 15,
          top: mousePos.y,
          transform: 'translateY(-100%)',
        }}
      >
        <div className="rounded-2xl overflow-hidden backdrop-blur-md border border-white/20 shadow-2xl">
          <img
            src={palaceThumbnails[hoveredPalaceId]}
            alt="Preview"
            className="w-full aspect-video object-cover"
            crossOrigin="anonymous"
          />
        </div>
      </div>,
      document.body
    )}
  </>
  );
};
