import React, { useState } from 'react';
import { Plus, Edit2, Cloudy, Save, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Palace } from '../lib/types';

interface PalaceListProps {
  palaces: Palace[];
  isLoading: boolean;
  onManagePalace: (palace: Palace) => void;
  onCreatePalace: (name: string) => void;
  onRenamePalace: (palace: Palace, newName: string) => void;
}

export const PalaceList = ({
  palaces,
  isLoading,
  onManagePalace,
  onCreatePalace,
  onRenamePalace
}: PalaceListProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPalaceName, setNewPalaceName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading palaces...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mind Palaces</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2"
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
          Create New
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Create New Palace Form */}
          {isCreating && (
            <form onSubmit={handleCreateSubmit} className="border rounded-lg p-4 bg-gray-50">
              <div className="space-y-2">
                <Input
                  placeholder="Enter palace name"
                  value={newPalaceName}
                  onChange={(e) => setNewPalaceName(e.target.value)}
                  autoFocus
                  disabled={isLoading}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreating(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newPalaceName.trim() || isLoading}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Palaces List */}
          <div className="space-y-3">
            {palaces.map((palace) => (
              <div
                key={palace.id}
                className="border rounded-lg p-4 hover:border-blue-200 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {editingId === palace.id ? (
                    // Edit Mode
                    <div className="flex items-center gap-2 flex-grow">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        className="max-w-sm"
                        disabled={isLoading}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRenameSubmit(palace)}
                        disabled={!editingName.trim() || isLoading}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={isLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between w-full">
                      <span className="text-lg font-medium">{palace.name}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(palace.id);
                            setEditingName(palace.name);
                          }}
                          disabled={isLoading}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onManagePalace(palace)}
                          disabled={isLoading}
                          className="flex items-center gap-2"
                        >
                          <Cloudy className="h-4 w-4" />
                          Manage Media
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {palaces.length === 0 && !isCreating && (
            <div className="text-center py-8 text-gray-500">
              No palaces yet. Create your first palace to get started!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};