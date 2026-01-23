import { useState, useEffect, useRef } from "react";
import { Header } from "./components/layout/Header";
import { AuthForm } from "./components/AuthForm";
import { PalaceList } from "./components/PalaceList";
import SpheresGrid, { type SpheresGridHandle } from "./components/SpheresGrid";
import { useAuth } from "./hooks/useAuth";
import { AlertCircle, Upload } from "lucide-react";
import { createApiClient } from "./lib/api";
import type { Palace, Media } from "./lib/types";
import { BackgroundLayer } from "./components/BackgroundLayer";
import { LiquidGlass } from "./components/ui/LiquidGlass";
import { PalaceViewer3D } from "./components/3d/PalaceViewer3D";
import { Button } from "./components/ui/button";



// Initialize API client
const api = createApiClient({
  baseUrl: import.meta.env.VITE_APP_API_URL,
  region: import.meta.env.VITE_APP_REGION,
  userPoolId: import.meta.env.VITE_APP_USER_POOL_ID,
  userPoolWebClientId: import.meta.env.VITE_APP_USER_POOL_CLIENT_ID,
});

function App() {
  const { authState, loading, signOut, checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [palaces, setPalaces] = useState<Palace[]>([]);
  const [allMedia, setAllMedia] = useState<Media[]>([]);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [palaceStats, setPalaceStats] = useState<{ spheres: number; connections: number } | null>(null);
  const [mediaCount, setMediaCount] = useState(0);
  const spheresGridRef = useRef<SpheresGridHandle>(null);

  const handleManagePalace = (palace: Palace | null) => {
    if (palace) {
      setSelectedPalace(palace);
      setPalaceStats(null); // Reset stats when selecting new palace
    } else {
      setSelectedPalace(null);
      setPalaceStats(null);
    }
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch palaces and media when authenticated
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchPalaces();
      fetchAllMedia();
    }
  }, [authState.isAuthenticated]);

  const fetchPalaces = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<Palace[]>("/palaces");
      setPalaces(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch palaces");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllMedia = async () => {
    try {
      const response = await api.getMedia();
      setAllMedia(response);
    } catch (err) {
      console.error("Failed to fetch media for thumbnails:", err);
    }
  };

  const handleCreatePalace = async (name: string) => {
    setIsLoading(true);
    try {
      const newPalace = await api.post<Palace>("/palaces", { name });
      setPalaces((prev) => [...prev, newPalace]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create palace");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenamePalace = async (palace: Palace, newName: string) => {
    setIsLoading(true);
    try {
      const updatedPalace = await api.put<Palace>(`/palaces/${palace.id}`, {
        ...palace,
        name: newName,
      });

      setPalaces((prev) =>
        prev.map((p) => (p.id === palace.id ? updatedPalace : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename palace");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <BackgroundLayer >
        <div className="flex items-center justify-center min-h-screen">
          <LiquidGlass className="text-center" padding="32px 48px">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="mt-2 text-white/80">Loading...</p>
          </LiquidGlass>
        </div>
      </BackgroundLayer>
    );
  }

  return (
    <BackgroundLayer >
      <Header
        userEmail={authState.user?.email}
        onSignOut={() => {
          signOut().catch((err) => {
            setError(err instanceof Error ? err.message : "Sign out failed");
          });
        }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {error && (
          <LiquidGlass className="mb-4" cornerRadius={12} padding="16px">
            <div className="flex items-center gap-3 text-red-300">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </LiquidGlass>
        )}

        {!authState.isAuthenticated ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <AuthForm
              onAuthSuccess={() => {
                checkAuth().catch((err) => {
                  setError(
                    err instanceof Error ? err.message : "Authentication failed"
                  );
                });
              }}
            />
          </div>
        ) : (
          <div>
            {!selectedPalace ? (
              <PalaceList
                palaces={palaces}
                isLoading={isLoading}
                onManagePalace={handleManagePalace}
                onCreatePalace={handleCreatePalace}
                onRenamePalace={handleRenamePalace}
                media={allMedia}
              />
            ) : (
              <div className="space-y-2">
                {/* Header with back button and stats */}
                <div className="flex items-center justify-between gap-4">
                  <LiquidGlass className="inline-block" cornerRadius={24} padding="12px 20px">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedPalace(null)}
                        className="text-white/70 hover:text-white transition-colors flex items-center gap-2"
                      >
                        ← Back
                      </button>
                      <div className="w-px h-5 bg-white/20" />
                      <h2 className="text-lg font-semibold text-white">{selectedPalace.name}</h2>
                    </div>
                  </LiquidGlass>
                  
                  {palaceStats && (
                    <LiquidGlass className="inline-block" cornerRadius={16} padding="10px 16px">
                      <div className="flex items-center gap-3 text-white/80 text-sm">
                        <span>{palaceStats.spheres} spheres</span>
                        <div className="w-px h-4 bg-white/20" />
                        <span>{palaceStats.connections} connections</span>
                      </div>
                    </LiquidGlass>
                  )}
                </div>

                {/* 3D Palace Viewer */}
                <PalaceViewer3D
                  palace={selectedPalace}
                  api={api}
                  onError={setError}
                  onDataLoaded={(spheres, connections) => setPalaceStats({ spheres, connections })}
                />

                {/* Media Management Grid */}
                <LiquidGlass className="w-full" cornerRadius={32} padding="24px">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Media Management</h3>
                      <span className="text-sm text-white/50">{mediaCount} items</span>
                    </div>
                    <Button 
                      variant="glass" 
                      className="cursor-pointer"
                      onClick={() => spheresGridRef.current?.triggerUpload()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Media
                    </Button>
                  </div>
                  <SpheresGrid
                    ref={spheresGridRef}
                    palace={selectedPalace}
                    api={api}
                    onError={setError}
                    onMediaCountChange={setMediaCount}
                  />
                </LiquidGlass>
              </div>
            )}
          </div>
        )}
      </main>
    </BackgroundLayer>
  );
}

export default App;
