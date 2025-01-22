// import React, { useState, useEffect } from "react";
import { useState, useEffect } from "react";
import { Header } from "./components/layout/Header";
import { AuthForm } from "./components/AuthForm";
import { PalaceList } from "./components/PalaceList";
import SpheresGrid from "./components/SpheresGrid";
import { useAuth } from "./hooks/useAuth";
import { Alert, AlertDescription } from "./components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from "./components/ui/button";
import { createApiClient } from "./lib/api";
import type { Palace } from "./lib/types";



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
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleManagePalace = (palace: Palace | null) => {
    if (palace) {
      console.log("Selected palace:", palace);
      setSelectedPalace(palace);
    } else {
      setSelectedPalace(null);
    }
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch palaces when authenticated
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchPalaces();
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        userEmail={authState.user?.email}
        onSignOut={() => {
          signOut().catch((err) => {
            setError(err instanceof Error ? err.message : "Sign out failed");
          });
        }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!authState.isAuthenticated ? (
          <AuthForm
            onAuthSuccess={() => {
              checkAuth().catch((err) => {
                setError(
                  err instanceof Error ? err.message : "Authentication failed"
                );
              });
            }}
          />
        ) : (
          <div>
            {!selectedPalace ? (
              <PalaceList
                palaces={palaces}
                isLoading={isLoading}
                onManagePalace={handleManagePalace} // Use the new handler
                onCreatePalace={handleCreatePalace}
                onRenamePalace={handleRenamePalace}
              />
            ) : (
              <div>
                <div className="mb-6">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPalace(null)}
                    className="mb-10 flex items-center gap-2"
                  >
                    ← Back to All Palaces
                  </Button>
                  <h2 className="text-2xl font-bold">{selectedPalace.name}</h2>
                </div>
                <SpheresGrid
                  palace={selectedPalace}
                  api={api}
                  onError={setError}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
