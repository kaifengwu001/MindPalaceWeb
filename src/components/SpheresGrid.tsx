import React, { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Upload,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X as XIcon,
} from "lucide-react";
import type { ApiClient } from "../lib/api";
import type { Palace, Media, MediaStatus, UploadProgress } from "../lib/types";

interface SpheresGridProps {
  palace: Palace;
  api: ApiClient;
  onError: (error: string) => void;
}

interface UploadState extends UploadProgress {
  filename: string;
}

/** Status-specific UI styling & icons. */
type StatusConfig = {
  bgColor: string;
  textColor: string;
  Icon:
    | typeof Upload
    | typeof RefreshCw
    | typeof AlertCircle
    | typeof CheckCircle;
  text: string;
  animate: string;
};

export const SpheresGrid: React.FC<SpheresGridProps> = ({
  palace,
  api,
  onError,
}) => {
  /** 
   * Instead of `isLoading`, we name it `isInitialLoading` to clarify that 
   * it should only be used for the first fetch (so we avoid 
   * re-showing a spinner for partial updates).
   */
  const [isInitialLoading, setIsInitialLoading] = useState(true); // NEW/CHANGED
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  /**
   * For exponential backoff, track current polling delays in state.
   * We'll have two separate timers:
   *  1) For items in "uploading"/"processing" statuses (poll them)
   *  2) For "ready" items missing a thumbnailUrl (poll them)
   */
  const [pollDelayMs, setPollDelayMs] = useState(2000); // poll uploading/processing
  const [missingUrlDelayMs, setMissingUrlDelayMs] = useState(3000); // poll missing thumbnail

  /**
   * A simple function that returns the next exponential interval,
   * doubling each time, capped at some max (e.g. 30s).
   */
  const getNextDelay = (current: number, max: number = 30000) => {
    return Math.min(current * 2, max);
  };

  /** 
   * We only want to do the big "fetch all" once initially. 
   * After that, we do partial merges so we don't lose thumbnails 
   * or cause a spinner flash. 
   */
  const fetchAllMediaOnce = useCallback(async () => {
    if (!palace?.id) {
      console.warn("No palace ID available");
      return;
    }
    setIsInitialLoading(true);
    try {
      const allMedia = await api.getMedia();
      const palaceMedia = allMedia.filter((m) => m.palaceId === palace.id);
      setMediaItems(palaceMedia);
    } catch (err) {
      console.error("Fetch error:", err);
      onError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsInitialLoading(false);
    }
  }, [api, palace?.id, onError]);

  // Load initial data once
  useEffect(() => {
    if (palace?.id) {
      fetchAllMediaOnce();
    }
  }, [fetchAllMediaOnce, palace?.id]);

  /**
   * Instead of refetching the entire list for updates, we do partial merges:
   * If the new data has a different status or new URLs, we only overwrite
   * those fields that are not undefined (so we don’t clobber known good data).
   */
  const mergeMediaUpdates = useCallback(
    (updates: Media[]) => {
      setMediaItems((prev) => {
        const newList = [...prev];
        for (const upd of updates) {
          const idx = newList.findIndex((x) => x.id === upd.id);
          if (idx !== -1) {
            // Merge carefully
            const old = newList[idx];
            newList[idx] = {
              ...old,
              // Only replace fields if the new data is not undefined
              status: upd.status ?? old.status,
              url: upd.url ?? old.url,
              thumbnailUrl: upd.thumbnailUrl ?? old.thumbnailUrl,
              duration: upd.duration ?? old.duration,
              width: upd.width ?? old.width,
              height: upd.height ?? old.height,
            };
          }
        }
        return newList;
      });
    },
    [setMediaItems]
  );

  /**
   * =============== Poll #1: For "uploading"/"processing" items ===============
   * We’ll use a useEffect with setTimeout (instead of setInterval),
   * so we can handle exponential backoff. If we still have items in those
   * statuses, we do partial merges, then schedule the next poll with 
   * a larger pollDelayMs. If all items are done, we reset the delay.
   */
  useEffect(() => {
    // Identify items that might need polling
    const processingMedia = mediaItems.filter((m) =>
      ["uploading", "processing", "pending"].includes(m.status)
    );
    if (processingMedia.length === 0) {
      // Reset poll delay if no items are in these states
      if (pollDelayMs !== 2000) setPollDelayMs(2000);
      return; // No need to schedule another poll
    }

    // We'll do a "poll" after pollDelayMs
    const timer = setTimeout(async () => {
      try {
        const updates = await Promise.all(
          processingMedia.map((m) => api.getMediaStatus(m.id))
        );

        // Merge them in place
        mergeMediaUpdates(updates);

        // Also reflect in the uploads array (if any match)
        setUploads((prev) =>
          prev.map((upload) => {
            const matching = updates.find((u) => u.id === upload.mediaId);
            if (matching) {
              // If it just became ready, set progress=100
              const newStatus = matching.status || upload.status;
              const newProgress = newStatus === "ready" ? 100 : upload.progress;
              return { ...upload, status: newStatus, progress: newProgress };
            }
            return upload;
          })
        );
      } catch (err) {
        console.error("Poll #1 error (upload/processing):", err);
      } finally {
        // If we still have items in uploading/processing, back off
        // else reset
        const stillHasUnready = mediaItems.some((m) =>
          ["uploading", "processing", "pending"].includes(m.status)
        );
        setPollDelayMs((prev) => (stillHasUnready ? getNextDelay(prev) : 2000));
      }
    }, pollDelayMs);

    return () => clearTimeout(timer);
  }, [mediaItems, api, pollDelayMs, mergeMediaUpdates]);

  /**
   * =============== Poll #2: For "ready" items missing a thumbnailUrl ===============
   * Similarly, exponential backoff until we either fill in the missing thumbnail
   * or we decide to stop.
   */
  useEffect(() => {
    const itemsMissingUrl = mediaItems.filter(
      (m) => m.status === "ready" && !m.thumbnailUrl
    );
    if (itemsMissingUrl.length === 0) {
      // Reset to default if none are missing
      if (missingUrlDelayMs !== 3000) setMissingUrlDelayMs(3000);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const updates: Media[] = [];
        for (const item of itemsMissingUrl) {
          // Attempt re-fetch
          try {
            const updated = await api.getMediaStatus(item.id);
            if (updated) {
              updates.push(updated);
            }
          } catch (err) {
            console.error("Poll #2 error (missing thumbnail) for ID:", item.id, err);
            // We continue, letting the loop handle others
          }
        }
        if (updates.length > 0) {
          mergeMediaUpdates(updates);
        }
      } catch (err) {
        console.error("Poll #2 batch error:", err);
      } finally {
        // If we still have items missing, back off
        const stillMissing = mediaItems.some(
          (m) => m.status === "ready" && !m.thumbnailUrl
        );
        setMissingUrlDelayMs((prev) => (stillMissing ? getNextDelay(prev) : 3000));
      }
    }, missingUrlDelayMs);

    return () => clearTimeout(timer);
  }, [mediaItems, api, missingUrlDelayMs, mergeMediaUpdates]);

  /**
   * Handle file uploads with concurrency + minimal retry
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setShowUploadPanel(true);

    const MAX_CONCURRENT_UPLOADS = 5;
    const RETRY_LIMIT = 3;

    const filesArray = Array.from(files);
    const uploadQueue = [...filesArray];
    const activeUploads = new Set<Promise<void>>();

    // Initialize local upload states for new files
    setUploads((prev) => [
      ...prev,
      ...filesArray.map((file) => ({
        filename: file.name,
        progress: 0,
        status: "uploading" as const,
        mediaId: "",
        error: undefined,
      })),
    ]);

    // The per-file task
    const processUpload = async (file: File) => {
      let attempts = 0;
      let success = false;
      let lastError: unknown = null;

      while (!success && attempts < RETRY_LIMIT) {
        attempts++;
        try {
          let mediaId = "";

          // Mark "uploading" in local state
          setUploads((prev) =>
            prev.map((u) =>
              u.filename === file.name ? { ...u, status: "uploading" } : u
            )
          );

          const media = await api.upload(file, palace.id, (progress) => {
            mediaId = progress.mediaId || mediaId;
            setUploads((prevUploads) =>
              prevUploads.map((u) =>
                u.filename === file.name
                  ? {
                      ...u,
                      progress: progress.progress,
                      mediaId: progress.mediaId || u.mediaId,
                    }
                  : u
              )
            );
          });

          // Mark "processing" in local state
          setUploads((prev) =>
            prev.map((u) =>
              u.filename === file.name
                ? { ...u, status: "processing", progress: 100, mediaId: media.id }
                : u
            )
          );

          // Add new media item into our local state
          setMediaItems((prev) => [...prev, media]);

          success = true;
        } catch (err) {
          lastError = err;
          console.warn(`Upload attempt ${attempts} failed for ${file.name}:`, err);
          if (attempts < RETRY_LIMIT) {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
      }

      // If still not successful
      if (!success) {
        const errorMessage =
          lastError instanceof Error
            ? lastError.message
            : "Upload failed. Unknown error.";
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? { ...u, status: "error", error: errorMessage }
              : u
          )
        );
      }
    };

    // Concurrency control
    while (uploadQueue.length > 0) {
      const concurrent: Promise<void>[] = [];

      while (
        concurrent.length < MAX_CONCURRENT_UPLOADS &&
        uploadQueue.length > 0
      ) {
        const file = uploadQueue.shift()!;
        const uploadPromise = processUpload(file).finally(() => {
          activeUploads.delete(uploadPromise);
        });
        concurrent.push(uploadPromise);
        activeUploads.add(uploadPromise);
      }

      // Wait for at least one to finish
      await Promise.race(concurrent).catch(() => {
        /* errors are handled inside processUpload */
      });
    }

    // Wait for all active uploads
    await Promise.allSettled(activeUploads);
  };

  /** Handle media deletion */
  const handleDeleteMedia = async () => {
    if (!mediaToDelete) return;
    try {
      await api.deleteMedia(mediaToDelete.id);
      setMediaItems((prev) => prev.filter((m) => m.id !== mediaToDelete.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete media");
    } finally {
      setMediaToDelete(null);
    }
  };

  /** Build status styling info */
  const getStatusConfig = (status: MediaStatus): StatusConfig => {
    const configs: Record<MediaStatus, StatusConfig> = {
      pending: {
        bgColor: "bg-yellow-100",
        textColor: "text-yellow-700",
        Icon: RefreshCw,
        text: "Processing",
        animate: "animate-spin",
      },
      processing: {
        bgColor: "bg-yellow-100",
        textColor: "text-yellow-700",
        Icon: RefreshCw,
        text: "Processing",
        animate: "animate-spin",
      },
      uploading: {
        bgColor: "bg-blue-100",
        textColor: "text-blue-700",
        Icon: Upload,
        text: "Uploading",
        animate: "animate-pulse",
      },
      ready: {
        bgColor: "bg-green-100",
        textColor: "text-green-700",
        Icon: CheckCircle,
        text: "Ready",
        animate: "",
      },
      error: {
        bgColor: "bg-red-100",
        textColor: "text-red-700",
        Icon: AlertCircle,
        text: "Error",
        animate: "",
      },
      deleted: {
        bgColor: "bg-gray-100",
        textColor: "text-gray-700",
        Icon: AlertCircle,
        text: "Deleted",
        animate: "",
      },
    };
    return configs[status];
  };

  /** Simple file size helper */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Show a loading spinner only on the first fetch
  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // MAIN RENDER
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {`Media Items: ${mediaItems.length}`}
        </h3>
        <div>
          {/* Hidden file input + label as a button */}
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            accept="image/*,video/*"
          />
          <label htmlFor="file-upload">
            <Button variant="outline" className="cursor-pointer" asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Upload Media
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* Upload Progress Panel */}
      {showUploadPanel &&
        uploads.length > 0 &&
        !uploads.every((u) => u.status === "ready") && (
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium">Uploads in Progress</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowUploadPanel(false)}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {uploads.map((upload) => (
                  <div
                    key={`${upload.mediaId}-${upload.filename}`}
                    className="space-y-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{upload.filename}</span>
                      <span
                        className={
                          upload.status === "error"
                            ? "text-red-500"
                            : upload.status === "processing"
                            ? "text-yellow-500"
                            : upload.status === "ready"
                            ? "text-green-500"
                            : "text-blue-500"
                        }
                      >
                        {upload.status === "error"
                          ? "Failed"
                          : upload.status === "processing"
                          ? "Processing"
                          : upload.status === "ready"
                          ? "Complete"
                          : `${Math.round(upload.progress)}%`}
                      </span>
                    </div>
                    <Progress
                      value={upload.status === "ready" ? 100 : upload.progress}
                      className={
                        upload.status === "error"
                          ? "bg-red-200"
                          : upload.status === "processing"
                          ? "bg-yellow-200"
                          : upload.status === "ready"
                          ? "bg-green-200"
                          : "bg-blue-200"
                      }
                    />
                    {upload.error && (
                      <div className="text-sm text-red-500">{upload.error}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Media Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mediaItems.map((media) => {
          const statusCfg = getStatusConfig(media.status);

          return (
            <Card key={`media-${media.id}`} className="relative overflow-hidden">
              <CardContent className="p-4">
                {/* Status badge */}
                <div
                  className={`absolute top-2 right-2 flex items-center gap-2 
                    ${statusCfg.bgColor} 
                    ${statusCfg.textColor} 
                    px-2 py-1 rounded z-10`}
                >
                  {React.createElement(statusCfg.Icon, {
                    className: `h-4 w-4 ${statusCfg.animate}`,
                  })}
                  <span>{statusCfg.text}</span>
                </div>

                {/* Thumbnail or placeholder */}
                <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4 relative">
                  {/* If "ready" and we have a thumbnail, display it */}
                  {media.status === "ready" && media.thumbnailUrl ? (
                    <img
                      src={media.thumbnailUrl}
                      alt={media.filename}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover rounded"
                      onError={(e) => {
                        console.error("Thumbnail load error:", {
                          mediaId: media.id,
                          status: media.status,
                          thumbnailUrl: media.thumbnailUrl,
                        });
                        e.currentTarget.src = "/placeholder.png";
                      }}
                    />
                  ) : (
                    // Otherwise a fallback
                    <div className="flex flex-col items-center justify-center text-gray-400 h-full w-full text-center">
                      {media.status === "uploading" ||
                      media.status === "processing" ||
                      media.status === "pending" ? (
                        <>
                          <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                          <p className="text-sm text-gray-500">
                            {media.status === "uploading"
                              ? "Uploading..."
                              : "Processing..."}
                          </p>
                        </>
                      ) : media.status === "error" ? (
                        <div className="text-red-500 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          <span>Error loading media</span>
                        </div>
                      ) : (
                        <div>Thumbnail not available</div>
                      )}
                    </div>
                  )}

                  {/* Duration if video */}
                  {media.type === "video" &&
                    media.duration &&
                    media.status === "ready" && (
                      <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
                        {Math.floor(media.duration / 60)}:
                        {String(Math.floor(media.duration % 60)).padStart(2, "0")}
                      </div>
                    )}
                </div>

                {/* Media Info */}
                <div className="flex flex-col gap-2">
                  {/* Filename + Type */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {media.type === "video" && (
                        <div className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Video
                        </div>
                      )}
                      <div
                        className="font-medium truncate"
                        title={media.filename}
                      >
                        {media.filename.length > 20
                          ? `${media.filename.slice(0, 20)}...`
                          : media.filename}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMediaToDelete(media)}
                      className="hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Resolution, size, etc. */}
                  <div className="text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      {media.width && media.height && (
                        <span>
                          {media.width}×{media.height}
                        </span>
                      )}
                      <span>{formatFileSize(media.size)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!mediaToDelete}
        onOpenChange={() => setMediaToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMedia}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SpheresGrid;







// import React, { useState, useEffect, useCallback } from "react";
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from "@/components/ui/alert-dialog";
// import { Progress } from "@/components/ui/progress";
// import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import {
//   Trash2,
//   Upload,
//   RefreshCw,
//   AlertCircle,
//   CheckCircle,
//   X as XIcon,
// } from "lucide-react";
// import type { ApiClient } from "../lib/api";
// import type {
//   Palace,
//   Media,
//   MediaStatus,
//   UploadProgress,
// } from "../lib/types";

// /** 
//  * Props 
//  */
// interface SpheresGridProps {
//   palace: Palace;
//   api: ApiClient;
//   onError: (error: string) => void;
// }

// /** 
//  * Local state shape for each uploading file 
//  */
// interface UploadState extends UploadProgress {
//   filename: string;
// }

// type StatusConfig = {
//   bgColor: string;
//   textColor: string;
//   Icon: typeof Upload | typeof RefreshCw | typeof AlertCircle | typeof CheckCircle;
//   text: string;
//   animate: string;
// };

// export const SpheresGrid: React.FC<SpheresGridProps> = ({
//   palace,
//   api,
//   onError,
// }) => {
//   const [mediaItems, setMediaItems] = useState<Media[]>([]);
//   const [uploads, setUploads] = useState<UploadState[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
//   const [showUploadPanel, setShowUploadPanel] = useState(false);

//   /**
//    * Fetch data (all media for this palace).
//    * 
//    * NOTE: If your backend provides a single endpoint that already returns 
//    * presigned URLs for all items, you can skip the fallback logic in the API 
//    * layer. If it requires a second request per item, we must handle partial failures.
//    */
//   const fetchData = useCallback(async () => {
//     if (!palace?.id) {
//       console.warn("No palace ID available");
//       return;
//     }

//     setIsLoading(true);
//     try {
//       // getMedia() should internally retry fetching presigned URLs and fallback if it fails
//       const allMedia = await api.getMedia();
//       // Filter to items belonging to this palace
//       const filtered = allMedia.filter((m) => m.palaceId === palace.id);
//       setMediaItems(filtered);
//     } catch (err) {
//       console.error("Fetch error:", err);
//       onError(err instanceof Error ? err.message : "Failed to fetch data");
//     } finally {
//       setIsLoading(false);
//     }
//   }, [api, palace?.id, onError]);

//   useEffect(() => {
//     if (palace?.id) {
//       fetchData();
//     }
//   }, [fetchData, palace?.id]);

//   /**
//    * Poll items that are still "uploading" or "processing" 
//    * to see if they've transitioned to "ready"
//    */
//   useEffect(() => {
//     const processingMedia = mediaItems.filter((m) =>
//       ["uploading", "processing"].includes(m.status)
//     );
//     if (processingMedia.length === 0) return;

//     const pollInterval = setInterval(async () => {
//       try {
//         const updates = await Promise.all(
//           processingMedia.map((m) => api.getMediaStatus(m.id))
//         );

//         // Determine if any statuses changed
//         const hasChanges = updates.some(
//           (update) =>
//             update.status !== mediaItems.find((m) => m.id === update.id)?.status
//         );

//         if (hasChanges) {
//           setMediaItems((prev) => {
//             const updated = [...prev];
//             updates.forEach((upd) => {
//               const idx = updated.findIndex((m) => m.id === upd.id);
//               if (idx !== -1) {
//                 // Merge existing item with updated fields
//                 updated[idx] = { ...updated[idx], ...upd };
//               }
//             });
//             return updated;
//           });

//           // Also reflect changes in the uploads array
//           setUploads((prev) =>
//             prev.map((u) => {
//               const matching = updates.find((upd) => upd.id === u.mediaId);
//               if (matching) {
//                 return {
//                   ...u,
//                   status: matching.status,
//                   progress: matching.status === "ready" ? 100 : u.progress,
//                 };
//               }
//               return u;
//             })
//           );

//           // If any item finished processing, optionally refetch the entire list
//           if (updates.some((u) => u.status === "ready")) {
//             fetchData();
//           }
//         }
//       } catch (error) {
//         console.error("Polling error:", error);
//       }
//     }, 5000);

//     return () => clearInterval(pollInterval);
//   }, [mediaItems, api, fetchData]);

//   /**
//    * Handle file uploads in concurrency with retry
//    */
//   const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
//     const files = event.target.files;
//     if (!files) return;

//     setShowUploadPanel(true);

//     const MAX_CONCURRENT_UPLOADS = 5;
//     const RETRY_LIMIT = 3;

//     const filesArray = Array.from(files);
//     const uploadQueue = [...filesArray];
//     const activeUploads = new Set<Promise<void>>();

//     // Initialize local state for new uploads
//     setUploads((prev) => [
//       ...prev,
//       ...filesArray.map((file) => ({
//         filename: file.name,
//         progress: 0,
//         status: "uploading" as const,
//         mediaId: "",
//         error: undefined,
//       })),
//     ]);

//     // The actual upload process with retry
//     const processUpload = async (file: File) => {
//       let attempts = 0;
//       let success = false;
//       let lastError: unknown = null;

//       while (!success && attempts < RETRY_LIMIT) {
//         attempts++;
//         try {
//           let mediaId = "";

//           // Mark "uploading"
//           setUploads((prev) =>
//             prev.map((u) =>
//               u.filename === file.name ? { ...u, status: "uploading" } : u
//             )
//           );

//           const media = await api.upload(file, palace.id, (progress) => {
//             mediaId = progress.mediaId || mediaId;
//             setUploads((prev) =>
//               prev.map((u) =>
//                 u.filename === file.name
//                   ? {
//                       ...u,
//                       mediaId: progress.mediaId || u.mediaId,
//                       progress: progress.progress,
//                     }
//                   : u
//               )
//             );
//           });

//           // Mark "processing" in local state
//           setUploads((prev) =>
//             prev.map((u) =>
//               u.filename === file.name
//                 ? { ...u, status: "processing", progress: 100, mediaId: media.id }
//                 : u
//             )
//           );

//           // Add the new media item to the list
//           setMediaItems((prev) => [...prev, media]);

//           success = true;
//         } catch (err) {
//           lastError = err;
//           console.warn(`Upload attempt ${attempts} failed:`, err);
//           // Optional small backoff
//           if (attempts < RETRY_LIMIT) {
//             await new Promise((r) => setTimeout(r, 1000));
//           }
//         }
//       }

//       // If it never succeeded
//       if (!success) {
//         const errorMessage =
//           lastError instanceof Error
//             ? lastError.message
//             : "Upload failed. Unknown error.";

//         setUploads((prev) =>
//           prev.map((u) =>
//             u.filename === file.name
//               ? { ...u, status: "error", error: errorMessage }
//               : u
//           )
//         );
//       }
//     };

//     // Concurrency control
//     while (uploadQueue.length > 0) {
//       const concurrent: Promise<void>[] = [];

//       while (
//         concurrent.length < MAX_CONCURRENT_UPLOADS &&
//         uploadQueue.length > 0
//       ) {
//         const file = uploadQueue.shift()!;
//         const p = processUpload(file).finally(() => activeUploads.delete(p));
//         concurrent.push(p);
//         activeUploads.add(p);
//       }

//       // Wait for at least one upload to finish
//       await Promise.race(concurrent).catch(() => {
//         // errors handled inside processUpload
//       });
//     }

//     // Wait for all uploads to finish
//     await Promise.allSettled(activeUploads);
//   };

//   /**
//    * Handle media deletion
//    */
//   const handleDeleteMedia = async () => {
//     if (!mediaToDelete) return;
//     try {
//       await api.deleteMedia(mediaToDelete.id);
//       setMediaItems((prev) => prev.filter((m) => m.id !== mediaToDelete.id));
//     } catch (err) {
//       onError(err instanceof Error ? err.message : "Failed to delete media");
//     } finally {
//       setMediaToDelete(null);
//     }
//   };

//   /**
//    * Status color/icon configs
//    */
//   const getStatusConfig = (status: MediaStatus): StatusConfig => {
//     const configs: Record<MediaStatus, StatusConfig> = {
//       pending: {
//         bgColor: "bg-yellow-100",
//         textColor: "text-yellow-700",
//         Icon: RefreshCw,
//         text: "Processing",
//         animate: "animate-spin",
//       },
//       processing: {
//         bgColor: "bg-yellow-100",
//         textColor: "text-yellow-700",
//         Icon: RefreshCw,
//         text: "Processing",
//         animate: "animate-spin",
//       },
//       uploading: {
//         bgColor: "bg-blue-100",
//         textColor: "text-blue-700",
//         Icon: Upload,
//         text: "Uploading",
//         animate: "animate-pulse",
//       },
//       ready: {
//         bgColor: "bg-green-100",
//         textColor: "text-green-700",
//         Icon: CheckCircle,
//         text: "Ready",
//         animate: "",
//       },
//       error: {
//         bgColor: "bg-red-100",
//         textColor: "text-red-700",
//         Icon: AlertCircle,
//         text: "Error",
//         animate: "",
//       },
//       deleted: {
//         bgColor: "bg-gray-100",
//         textColor: "text-gray-700",
//         Icon: AlertCircle,
//         text: "Deleted",
//         animate: "",
//       },
//     };

//     return configs[status];
//   };

//   /**
//    * Helper for file size
//    */
//   const formatFileSize = (bytes: number): string => {
//     if (bytes === 0) return "0 B";
//     const k = 1024;
//     const sizes = ["B", "KB", "MB", "GB"];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
//   };

//   // Show a spinner while loading
//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center h-64">
//         <RefreshCw className="h-6 w-6 animate-spin" />
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6">
//       {/* Header with 'Upload Media' */}
//       <div className="flex justify-between items-center">
//         <h3 className="text-lg font-medium">{`Media Items: ${mediaItems.length}`}</h3>
//         <div>
//           <input
//             type="file"
//             multiple
//             onChange={handleFileUpload}
//             className="hidden"
//             id="file-upload"
//             accept="image/*,video/*"
//           />
//           <label htmlFor="file-upload">
//             <Button variant="outline" className="cursor-pointer" asChild>
//               <span>
//                 <Upload className="h-4 w-4 mr-2" />
//                 Upload Media
//               </span>
//             </Button>
//           </label>
//         </div>
//       </div>

//       {/* Uploads in progress panel */}
//       {showUploadPanel &&
//         uploads.length > 0 &&
//         !uploads.every((u) => u.status === "ready") && (
//           <Card>
//             <CardContent className="p-4">
//               <div className="flex justify-between items-center mb-4">
//                 <h4 className="font-medium">Uploads in Progress</h4>
//                 <Button
//                   variant="ghost"
//                   size="icon"
//                   onClick={() => setShowUploadPanel(false)}
//                 >
//                   <XIcon className="h-4 w-4" />
//                 </Button>
//               </div>
//               <div className="space-y-4">
//                 {uploads.map((upload) => (
//                   <div
//                     key={`${upload.mediaId}-${upload.filename}`}
//                     className="space-y-2"
//                   >
//                     <div className="flex justify-between text-sm">
//                       <span className="truncate">{upload.filename}</span>
//                       <span
//                         className={
//                           upload.status === "error"
//                             ? "text-red-500"
//                             : upload.status === "processing"
//                             ? "text-yellow-500"
//                             : upload.status === "ready"
//                             ? "text-green-500"
//                             : "text-blue-500"
//                         }
//                       >
//                         {upload.status === "error"
//                           ? "Failed"
//                           : upload.status === "processing"
//                           ? "Processing"
//                           : upload.status === "ready"
//                           ? "Complete"
//                           : `${Math.round(upload.progress)}%`}
//                       </span>
//                     </div>
//                     <Progress
//                       value={
//                         upload.status === "ready" ? 100 : upload.progress
//                       }
//                       className={
//                         upload.status === "error"
//                           ? "bg-red-200"
//                           : upload.status === "processing"
//                           ? "bg-yellow-200"
//                           : upload.status === "ready"
//                           ? "bg-green-200"
//                           : "bg-blue-200"
//                       }
//                     />
//                     {upload.error && (
//                       <div className="text-sm text-red-500">{upload.error}</div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             </CardContent>
//           </Card>
//         )}

//       {/* Media grid */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//         {mediaItems.map((media) => (
//           <Card key={`media-${media.id}`} className="relative overflow-hidden">
//             <CardContent className="p-4">
//               {/* Status badge in the top-right corner */}
//               <div
//                 className={`absolute top-2 right-2 flex items-center gap-2 
//                   ${getStatusConfig(media.status).bgColor} 
//                   ${getStatusConfig(media.status).textColor} 
//                   px-2 py-1 rounded z-10`}
//               >
//                 {React.createElement(getStatusConfig(media.status).Icon, {
//                   className: `h-4 w-4 ${getStatusConfig(media.status).animate}`,
//                 })}
//                 <span>{getStatusConfig(media.status).text}</span>
//               </div>

//               {/* Thumbnail (or fallback) */}
//               <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4 relative">
//                 {media.status === "ready" && media.thumbnailUrl ? (
//                   <img
//                     src={media.thumbnailUrl}
//                     alt={media.filename}
//                     crossOrigin="anonymous"
//                     className="w-full h-full object-cover rounded"
//                     onError={(e) => {
//                       console.error("Thumbnail load error:", {
//                         mediaId: media.id,
//                         status: media.status,
//                         thumbnailUrl: media.thumbnailUrl,
//                       });
//                       e.currentTarget.src = "/placeholder.png";
//                     }}
//                   />
//                 ) : (
//                   <div className="flex flex-col items-center justify-center h-full w-full text-center">
//                     {media.status === "uploading" ||
//                     media.status === "processing" ? (
//                       <>
//                         <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
//                         <p className="text-sm text-gray-500">
//                           {media.status === "uploading"
//                             ? "Uploading..."
//                             : "Processing..."}
//                         </p>
//                       </>
//                     ) : media.status === "error" ? (
//                       <div className="text-red-500 flex items-center gap-2">
//                         <AlertCircle className="h-5 w-5" />
//                         <span>Error loading media</span>
//                       </div>
//                     ) : (
//                       // e.g. fallback if we never got a presigned URL
//                       <div className="text-gray-400">
//                         Thumbnail not available
//                       </div>
//                     )}
//                   </div>
//                 )}

//                 {/* Show duration if it's a video */}
//                 {media.type === "video" &&
//                   media.duration &&
//                   media.status === "ready" && (
//                     <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
//                       {Math.floor(media.duration / 60)}:
//                       {String(Math.floor(media.duration % 60)).padStart(2, "0")}
//                     </div>
//                   )}
//               </div>

//               {/* Media info: filename, type, resolution, etc. */}
//               <div className="flex flex-col gap-2">
//                 <div className="flex justify-between items-center">
//                   <div className="flex items-center gap-2">
//                     {media.type === "video" && (
//                       <div className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
//                         Video
//                       </div>
//                     )}
//                     <div
//                       className="font-medium truncate"
//                       title={media.filename}
//                     >
//                       {media.filename.length > 20
//                         ? `${media.filename.slice(0, 20)}...`
//                         : media.filename}
//                     </div>
//                   </div>
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     onClick={() => setMediaToDelete(media)}
//                     className="hover:bg-red-50 hover:text-red-500"
//                   >
//                     <Trash2 className="h-4 w-4" />
//                   </Button>
//                 </div>
//                 <div className="text-sm text-gray-500">
//                   <div className="flex items-center gap-2">
//                     {media.width && media.height && (
//                       <span>
//                         {media.width}×{media.height}
//                       </span>
//                     )}
//                     <span>{formatFileSize(media.size)}</span>
//                   </div>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         ))}
//       </div>

//       {/* Delete Confirmation Dialog */}
//       <AlertDialog
//         open={!!mediaToDelete}
//         onOpenChange={() => setMediaToDelete(null)}
//       >
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Media</AlertDialogTitle>
//             <AlertDialogDescription>
//               This cannot be undone.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction onClick={handleDeleteMedia}>
//               Delete
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </div>
//   );
// };

// export default SpheresGrid;



// // // OLD VERSION with no upload throttling
// // import React, { useState, useEffect, useCallback } from "react";
// // import {
// //   AlertDialog,
// //   AlertDialogAction,
// //   AlertDialogCancel,
// //   AlertDialogContent,
// //   AlertDialogDescription,
// //   AlertDialogFooter,
// //   AlertDialogHeader,
// //   AlertDialogTitle,
// // } from "@/components/ui/alert-dialog";
// // import { Progress } from "@/components/ui/progress";
// // import { Card, CardContent } from "@/components/ui/card";
// // import { Button } from "@/components/ui/button";
// // import {
// //   Trash2,
// //   Upload,
// //   RefreshCw,
// //   AlertCircle,
// //   CheckCircle,
// //   X as XIcon,
// // } from "lucide-react";
// // import type { ApiClient } from "../lib/api";
// // import type {
// //   Sphere,
// //   Media,
// //   Palace,
// //   MediaStatus,
// //   UploadProgress,
// // } from "../lib/types";

// // interface SpheresGridProps {
// //   palace: Palace;
// //   api: ApiClient;
// //   onError: (error: string) => void;
// // }

// // interface UploadState extends UploadProgress {
// //   filename: string;
// // }

// // type StatusConfig = {
// //   bgColor: string;
// //   textColor: string;
// //   Icon:
// //     | typeof Upload
// //     | typeof RefreshCw
// //     | typeof AlertCircle
// //     | typeof CheckCircle;
// //   text: string;
// //   animate: string;
// // };

// // export const SpheresGrid: React.FC<SpheresGridProps> = ({
// //   palace,
// //   api,
// //   onError,
// // }) => {
// //   const [spheres, setSpheres] = useState<Sphere[]>([]);
// //   const [mediaItems, setMediaItems] = useState<Media[]>([]);
// //   const [uploads, setUploads] = useState<UploadState[]>([]);
// //   const [isLoading, setIsLoading] = useState(true);
// //   const [sphereToDelete, setSphereToDelete] = useState<Sphere | null>(null);
// //   const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
// //   const [showUploadPanel, setShowUploadPanel] = useState(false);

// //   const fetchData = useCallback(async () => {
// //     if (!palace?.id) {
// //       console.warn("No palace ID available");
// //       return;
// //     }

// //     try {
// //       console.log("Fetching data for palace:", palace.id);

// //       const [spheresData, allMedia] = await Promise.all([
// //         api.getSpheres(palace.id),
// //         api.getMedia(),
// //       ]);

// //       console.log("Fetched all media:", allMedia);

// //       // Filter media with null checks
// //       const mediaData = allMedia.filter((m) => m && m.palaceId === palace.id);

// //       console.log("Filtered media for palace:", mediaData);

// //       setSpheres(spheresData || []);
// //       setMediaItems(mediaData);
// //     } catch (err) {
// //       console.error("Fetch error:", err);
// //       onError(err instanceof Error ? err.message : "Failed to fetch data");
// //     } finally {
// //       setIsLoading(false);
// //     }
// //   }, [api, palace?.id, onError]);

// //   // Add useEffect dependency check
// //   useEffect(() => {
// //     if (palace?.id) {
// //       fetchData();
// //     }
// //   }, [fetchData, palace?.id]);

// //   // // Add the cleanup effect here
// //   // useEffect(() => {
// //   //     // Cleanup function to revoke blob URLs when component unmounts
// //   //     return () => {
// //   //       mediaItems.forEach(media => {
// //   //         if (media) {
// //   //           api.cleanupBlobUrl(media.url);
// //   //           api.cleanupBlobUrl(media.thumbnailUrl);
// //   //         }
// //   //       });
// //   //     };
// //   //   }, [mediaItems, api]);  // Add api to dependencies

// //   useEffect(() => {
// //     fetchData();
// //   }, [fetchData]);

// //   useEffect(() => {
// //     const processingMedia = mediaItems.filter((m) =>
// //       ["uploading", "processing"].includes(m.status)
// //     );

// //     if (processingMedia.length === 0) return;

// //     const pollInterval = setInterval(async () => {
// //       try {
// //         const updates = await Promise.all(
// //           processingMedia.map((m) => api.getMediaStatus(m.id))
// //         );

// //         const hasChanges = updates.some(
// //           (update) =>
// //             update.status !== mediaItems.find((m) => m.id === update.id)?.status
// //         );

// //         if (hasChanges) {
// //           setMediaItems((prev) => {
// //             const updated = [...prev];
// //             updates.forEach((update) => {
// //               const index = updated.findIndex((m) => m.id === update.id);
// //               if (index !== -1) updated[index] = update;
// //             });
// //             return updated;
// //           });

// //           // Update the uploads state when media status changes
// //           setUploads((prev) =>
// //             prev.map((upload) => {
// //               const matchingUpdate = updates.find(
// //                 (u) => u.id === upload.mediaId
// //               );
// //               if (matchingUpdate) {
// //                 return {
// //                   ...upload,
// //                   status: matchingUpdate.status,
// //                   progress:
// //                     matchingUpdate.status === "ready" ? 100 : upload.progress,
// //                 };
// //               }
// //               return upload;
// //             })
// //           );

// //           if (updates.some((u) => u.status === "ready")) {
// //             fetchData();
// //           }
// //         }
// //       } catch (error) {
// //         console.error("Polling error:", error);
// //       }
// //     }, 5000);

// //     return () => clearInterval(pollInterval);
// //   }, [mediaItems, api, fetchData]);

// //   //New handle file upload to better handle concurrent uploads
// //   const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
// //     const files = event.target.files;
// //     if (!files) return;
  
// //     setShowUploadPanel(true);
  
// //     // Create a stable reference for tracking uploads
// //     const uploadTracker = new Map<string, string>(); // filename -> mediaId
  
// //     const uploadPromises = Array.from(files).map(async (file) => {
// //       try {
// //         // Initialize upload state with unique identifier
// //         const newUpload: UploadState = {
// //           mediaId: "",
// //           filename: file.name,
// //           progress: 0,
// //           status: "uploading",
// //         };
  
// //         setUploads((prev) => [...prev, newUpload]);
  
// //         const media = await api.upload(file, palace.id, (progress) => {
// //           // Track mediaId for this file
// //           if (progress.mediaId) {
// //             uploadTracker.set(file.name, progress.mediaId);
// //           }
  
// //           // Update progress maintaining correct status
// //           setUploads((prev) =>
// //             prev.map((u) =>
// //               u.filename === file.name 
// //                 ? { 
// //                     ...u, 
// //                     mediaId: progress.mediaId,
// //                     progress: progress.progress,
// //                     // Keep existing status unless explicitly changed
// //                     status: u.status === "error" ? "error" : "uploading"
// //                   } 
// //                 : u
// //             )
// //           );
// //         });
  
// //         // After successful upload, update to processing state
// //         setUploads((prev) =>
// //           prev.map((u) =>
// //             u.filename === file.name 
// //               ? { 
// //                   ...u, 
// //                   mediaId: media.id,
// //                   progress: 100,
// //                   status: "processing"
// //                 } 
// //               : u
// //           )
// //         );
  
// //         return media;
  
// //       } catch (err) {
// //         const error = err instanceof Error ? err.message : "Upload failed";
// //         setUploads((prev) =>
// //           prev.map((u) =>
// //             u.filename === file.name 
// //               ? { ...u, status: "error", error } 
// //               : u
// //           )
// //         );
// //         onError(error);
// //       }
// //     });
  
// //     try {
// //       const results = await Promise.allSettled(uploadPromises);
// //       const successfulMedia = results
// //         .filter((result): result is PromiseFulfilledResult<Media> => 
// //           result.status === "fulfilled"
// //         )
// //         .map(result => result.value);
      
// //       // Update media items state
// //       setMediaItems(prev => [...prev, ...successfulMedia]);
  
// //       // The existing useEffect polling mechanism will handle subsequent status updates
// //       // as it's already designed to handle multiple media items
// //     } catch (error) {
// //       console.error('Batch upload error:', error);
// //     }
// //   };

// //   const handleDeleteSphere = async () => {
// //     if (!sphereToDelete) return;

// //     try {
// //       await api.deleteSphere(palace.id, sphereToDelete.id);
// //       setSpheres((prev) => prev.filter((s) => s.id !== sphereToDelete.id));
// //       setMediaItems((prev) =>
// //         prev.filter((m) => m.sphereId !== sphereToDelete.id)
// //       );
// //     } catch (err) {
// //       onError(err instanceof Error ? err.message : "Failed to delete sphere");
// //     } finally {
// //       setSphereToDelete(null);
// //     }
// //   };

// //   const handleDeleteMedia = async () => {
// //     if (!mediaToDelete) return;
  
// //     try {
// //       await api.deleteMedia(mediaToDelete.id);
// //       setMediaItems((prev) => prev.filter((m) => m.id !== mediaToDelete.id));
// //     } catch (err) {
// //       onError(err instanceof Error ? err.message : "Failed to delete media");
// //     } finally {
// //       setMediaToDelete(null);
// //     }
// //   };

// //   const getStatusConfig = (status: MediaStatus): StatusConfig => {
// //     const configs: Record<MediaStatus, StatusConfig> = {
// //       pending: {
// //         bgColor: "bg-yellow-100",
// //         textColor: "text-yellow-700",
// //         Icon: RefreshCw,
// //         text: "Processing",
// //         animate: "animate-spin",
// //       },
// //       processing: {
// //         bgColor: "bg-yellow-100",
// //         textColor: "text-yellow-700",
// //         Icon: RefreshCw,
// //         text: "Processing",
// //         animate: "animate-spin",
// //       },
// //       uploading: {
// //         bgColor: "bg-blue-100",
// //         textColor: "text-blue-700",
// //         Icon: Upload,
// //         text: "Uploading",
// //         animate: "animate-pulse",
// //       },
// //       ready: {
// //         bgColor: "bg-green-100",
// //         textColor: "text-green-700",
// //         Icon: CheckCircle,
// //         text: "Ready",
// //         animate: "",
// //       },
// //       error: {
// //         bgColor: "bg-red-100",
// //         textColor: "text-red-700",
// //         Icon: AlertCircle,
// //         text: "Error",
// //         animate: "",
// //       },
// //       deleted: {
// //         bgColor: "bg-gray-100",
// //         textColor: "text-gray-700",
// //         Icon: AlertCircle,
// //         text: "Deleted",
// //         animate: "",
// //       },
// //     };

// //     return configs[status];
// //   };

// //   {
// //     /* Helper function for formatting file sizes */
// //   }
// //   const formatFileSize = (bytes: number): string => {
// //     if (bytes === 0) return "0 B";
// //     const k = 1024;
// //     const sizes = ["B", "KB", "MB", "GB"];
// //     const i = Math.floor(Math.log(bytes) / Math.log(k));
// //     return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
// //   };

// //   // Add debug rendering to help identify issues
// //   if (isLoading) {
// //     return (
// //       <div className="flex items-center justify-center h-64">
// //         <RefreshCw className="h-6 w-6 animate-spin" />
// //       </div>
// //     );
// //   }
// //   // Add debug info
// //   console.log("Rendering with:", {
// //     spheresCount: spheres.length,
// //     mediaItemsCount: mediaItems.length,
// //     palaceId: palace.id,
// //   });

// //   return (
// //     <div className="space-y-6">
// //       {/* Add debug info in UI */}
// //       {/* <div className="text-sm text-gray-500">
// //         {`Nodes: ${spheres.length}, Media Items: ${mediaItems.length}`}
// //       </div> */}
// //       <div className="flex justify-between items-center">
// //         <h3 className="text-lg font-medium">
// //           {" "}
// //           {`Nodes: ${spheres.length}   Media Items: ${mediaItems.length}`}
// //         </h3>
// //         <div>
// //           <input
// //             type="file"
// //             multiple
// //             onChange={handleFileUpload}
// //             className="hidden"
// //             id="file-upload"
// //             accept="image/*,video/*"
// //           />
// //           <label htmlFor="file-upload">
// //             <Button variant="outline" className="cursor-pointer" asChild>
// //               <span>
// //                 <Upload className="h-4 w-4 mr-2" />
// //                 Upload Media
// //               </span>
// //             </Button>
// //           </label>
// //         </div>
// //       </div>

// //       {/* Upload Progress Panel */}
// //       {showUploadPanel &&
// //         uploads.length > 0 &&
// //         !uploads.every((u) => u.status === "ready") && (
// //           <Card>
// //             <CardContent className="p-4">
// //               <div className="flex justify-between items-center mb-4">
// //                 <h4 className="font-medium">Uploads in Progress</h4>
// //                 <Button
// //                   variant="ghost"
// //                   size="icon"
// //                   onClick={() => setShowUploadPanel(false)}
// //                 >
// //                   <XIcon className="h-4 w-4" />
// //                 </Button>
// //               </div>
// //               <div className="space-y-4">
// //                 {uploads.map((upload) => (
// //                   <div
// //                     key={`${upload.mediaId}-${upload.filename}`}
// //                     className="space-y-2"
// //                   >
// //                     <div className="flex justify-between text-sm">
// //                       <span className="truncate">{upload.filename}</span>
// //                       <span
// //                         className={
// //                           upload.status === "error"
// //                             ? "text-red-500"
// //                             : upload.status === "processing"
// //                             ? "text-yellow-500"
// //                             : upload.status === "ready"
// //                             ? "text-green-500"
// //                             : "text-blue-500"
// //                         }
// //                       >
// //                         {upload.status === "error"
// //                           ? "Failed"
// //                           : upload.status === "processing"
// //                           ? "Processing"
// //                           : upload.status === "ready"
// //                           ? "Complete"
// //                           : `${Math.round(upload.progress)}%`}
// //                       </span>
// //                     </div>
// //                     <Progress
// //                       value={upload.status === "ready" ? 100 : upload.progress}
// //                       className={
// //                         upload.status === "error"
// //                           ? "bg-red-200"
// //                           : upload.status === "processing"
// //                           ? "bg-yellow-200"
// //                           : upload.status === "ready"
// //                           ? "bg-green-200"
// //                           : "bg-blue-200"
// //                       }
// //                     />
// //                     {upload.error && (
// //                       <div className="text-sm text-red-500">{upload.error}</div>
// //                     )}
// //                   </div>
// //                 ))}
// //               </div>
// //             </CardContent>
// //           </Card>
// //         )}

// //       {/* Combined Spheres & Media Grid */}
// //       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
// //         {/* Media Items */}
// //         {mediaItems.map((media) => (
// //           <Card key={`media-${media.id}`} className="relative overflow-hidden">
// //             <CardContent className="p-4">
// //               {/* Status badge */}
// //               <div
// //                 className={`absolute top-2 right-2 flex items-center gap-2 
// //           ${getStatusConfig(media.status).bgColor} 
// //           ${getStatusConfig(media.status).textColor} 
// //           px-2 py-1 rounded z-10`}
// //               >
// //                 {React.createElement(getStatusConfig(media.status).Icon, {
// //                   className: `h-4 w-4 ${getStatusConfig(media.status).animate}`,
// //                 })}
// //                 <span>{getStatusConfig(media.status).text}</span>
// //               </div>

// //               {/* Media Preview */}
// //               <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4 relative">
// //                 {media.status === "ready" && media.thumbnailUrl ? (
// //                   <img
// //                     src={media.thumbnailUrl}
// //                     alt={media.filename}
// //                     crossOrigin="anonymous"
// //                     className="w-full h-full object-cover rounded"
// //                     onError={(e) => {
// //                       console.error("Thumbnail load error:", {
// //                         mediaId: media.id,
// //                         status: media.status,
// //                         thumbnailUrl: media.thumbnailUrl,
// //                       });
// //                       e.currentTarget.src = "/placeholder.png";
// //                     }}
// //                   />
// //                 ) : (
// //                   <div className="flex items-center justify-center h-full w-full">
// //                     {media.status === "uploading" ||
// //                     media.status === "processing" ? (
// //                       <div className="text-center">
// //                         <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
// //                         <p className="text-sm text-gray-500">
// //                           {media.status === "uploading"
// //                             ? "Uploading..."
// //                             : "Processing..."}
// //                         </p>
// //                       </div>
// //                     ) : (
// //                       <div className="text-gray-400 flex items-center gap-2">
// //                         <AlertCircle className="h-5 w-5" />
// //                         <span>
// //                           {media.status === "error"
// //                             ? "Error loading media"
// //                             : "Thumbnail not available"}
// //                         </span>
// //                       </div>
// //                     )}
// //                   </div>
// //                 )}

// //                 {/* Video Duration Badge */}
// //                 {media.type === "video" &&
// //                   media.duration &&
// //                   media.status === "ready" && (
// //                     <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
// //                       {Math.floor(media.duration / 60)}:
// //                       {String(Math.floor(media.duration % 60)).padStart(2, "0")}
// //                     </div>
// //                   )}
// //               </div>

// //               {/* Media Information */}
// //               <div className="flex flex-col gap-2">
// //                 {/* Title and Type Badge */}
// //                 <div className="flex justify-between items-center">
// //                   <div className="flex items-center gap-2">
// //                     {media.type === "video" && (
// //                       <div className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
// //                         Video
// //                       </div>
// //                     )}
// //                     <div
// //                       className="font-medium truncate"
// //                       title={media.filename}
// //                     >
// //                       {media.filename.length > 20
// //                         ? `${media.filename.slice(0, 20)}...`
// //                         : media.filename}
// //                     </div>
// //                   </div>
// //                   <Button
// //                     variant="ghost"
// //                     size="icon"
// //                     onClick={() => setMediaToDelete(media)}
// //                     className="hover:bg-red-50 hover:text-red-500"
// //                   >
// //                     <Trash2 className="h-4 w-4" />
// //                   </Button>
// //                 </div>

// //                 {/* Details */}
// //                 <div className="text-sm text-gray-500">
// //                   <div className="flex items-center gap-2">
// //                     {/* Resolution if available */}
// //                     {media.width && media.height && (
// //                       <span>
// //                         {media.width}×{media.height}
// //                       </span>
// //                     )}
// //                     {/* File size */}
// //                     <span>{formatFileSize(media.size)}</span>
// //                   </div>
// //                 </div>
// //               </div>
// //             </CardContent>
// //           </Card>
// //         ))}

// //         {/* Empty Spheres */}
// //         {spheres
// //           .filter((sphere) => !mediaItems.some((m) => m.sphereId === sphere.id))
// //           .map((sphere) => (
// //             <Card
// //               key={`sphere-${sphere.id}`}
// //               className="relative overflow-hidden"
// //             >
// //               <CardContent className="p-4">
// //                 <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4">
// //                   <div className="text-gray-400 flex flex-col items-center gap-2">
// //                     <Upload className="h-6 w-6" />
// //                     <span className="text-sm">No media</span>
// //                   </div>
// //                 </div>

// //                 <div className="flex justify-between items-center">
// //                   <div className="font-medium">
// //                     Sphere {sphere.id.slice(0, 8)}
// //                   </div>
// //                   <Button
// //                     variant="ghost"
// //                     size="icon"
// //                     onClick={() => setSphereToDelete(sphere)}
// //                     className="hover:bg-red-50 hover:text-red-500"
// //                   >
// //                     <Trash2 className="h-4 w-4" />
// //                   </Button>
// //                 </div>
// //               </CardContent>
// //             </Card>
// //           ))}
// //       </div>

// //       {/* Delete Confirmation Dialog */}
// //       <AlertDialog
// //         open={!!sphereToDelete}
// //         onOpenChange={() => setSphereToDelete(null)}
// //       >
// //         <AlertDialogContent>
// //           <AlertDialogHeader>
// //             <AlertDialogTitle>Delete Sphere</AlertDialogTitle>
// //             <AlertDialogDescription>
// //               Are you sure you want to delete this sphere? This action cannot be
// //               undone. Any associated media will also be deleted.
// //             </AlertDialogDescription>
// //           </AlertDialogHeader>
// //           <AlertDialogFooter>
// //             <AlertDialogCancel>Cancel</AlertDialogCancel>
// //             <AlertDialogAction onClick={handleDeleteSphere}>
// //               Delete
// //             </AlertDialogAction>
// //           </AlertDialogFooter>
// //         </AlertDialogContent>
// //       </AlertDialog>

// //       {/* Add new Media Delete Dialog */}
// //       <AlertDialog
// //         open={!!mediaToDelete}
// //         onOpenChange={() => setMediaToDelete(null)}
// //       >
// //         <AlertDialogContent>
// //           <AlertDialogHeader>
// //             <AlertDialogTitle>Delete Media</AlertDialogTitle>
// //             <AlertDialogDescription>
// //               Are you sure you want to delete this media item? This action cannot be
// //               undone.
// //             </AlertDialogDescription>
// //           </AlertDialogHeader>
// //           <AlertDialogFooter>
// //             <AlertDialogCancel>Cancel</AlertDialogCancel>
// //             <AlertDialogAction onClick={handleDeleteMedia}>
// //               Delete
// //             </AlertDialogAction>
// //           </AlertDialogFooter>
// //         </AlertDialogContent>
// //       </AlertDialog>
// //     </div>
// //   );
// // };

// // export default SpheresGrid;
