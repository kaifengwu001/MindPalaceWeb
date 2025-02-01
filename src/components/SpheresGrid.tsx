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
import type {
  Sphere,
  Media,
  Palace,
  MediaStatus,
  UploadProgress,
} from "../lib/types";

interface SpheresGridProps {
  palace: Palace;
  api: ApiClient;
  onError: (error: string) => void;
}

interface UploadState extends UploadProgress {
  filename: string;
}

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
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sphereToDelete, setSphereToDelete] = useState<Sphere | null>(null);
  const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  const fetchData = useCallback(async () => {
    if (!palace?.id) {
      console.warn("No palace ID available");
      return;
    }

    try {
      console.log("Fetching data for palace:", palace.id);

      const [spheresData, allMedia] = await Promise.all([
        api.getSpheres(palace.id),
        api.getMedia(),
      ]);

      console.log("Fetched all media:", allMedia);

      // Filter media with null checks
      const mediaData = allMedia.filter((m) => m && m.palaceId === palace.id);

      console.log("Filtered media for palace:", mediaData);

      setSpheres(spheresData || []);
      setMediaItems(mediaData);
    } catch (err) {
      console.error("Fetch error:", err);
      onError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, [api, palace?.id, onError]);

  useEffect(() => {
    if (palace?.id) {
      fetchData();
    }
  }, [fetchData, palace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const processingMedia = mediaItems.filter((m) =>
      ["uploading", "processing"].includes(m.status)
    );

    if (processingMedia.length === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          processingMedia.map((m) => api.getMediaStatus(m.id))
        );

        const hasChanges = updates.some(
          (update) =>
            update.status !== mediaItems.find((m) => m.id === update.id)?.status
        );

        if (hasChanges) {
          setMediaItems((prev) => {
            const updated = [...prev];
            updates.forEach((update) => {
              const index = updated.findIndex((m) => m.id === update.id);
              if (index !== -1) updated[index] = update;
            });
            return updated;
          });

          // Update the uploads state when media status changes
          setUploads((prev) =>
            prev.map((upload) => {
              const matchingUpdate = updates.find(
                (u) => u.id === upload.mediaId
              );
              if (matchingUpdate) {
                return {
                  ...upload,
                  status: matchingUpdate.status,
                  progress:
                    matchingUpdate.status === "ready" ? 100 : upload.progress,
                };
              }
              return upload;
            })
          );

          if (updates.some((u) => u.status === "ready")) {
            fetchData();
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [mediaItems, api, fetchData]);

  // ─── HELPER FUNCTIONS FOR CONCURRENT UPLOADS ──────────────────────────────

  // Upload a single file with progress updates.
  const uploadFileWithProgress = async (file: File): Promise<Media> => {
    // Initialize upload state for this file.
    const newUpload: UploadState = {
      mediaId: "",
      filename: file.name,
      progress: 0,
      status: "uploading",
    };
    setUploads((prev) => [...prev, newUpload]);

    try {
      const media = await api.upload(file, palace.id, (progress) => {
        // Update progress for the file.
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? {
                  ...u,
                  mediaId: progress.mediaId,
                  progress: progress.progress,
                  status: u.status === "error" ? "error" : "uploading",
                }
              : u
          )
        );
      });

      // Update the state once the file is done uploading.
      setUploads((prev) =>
        prev.map((u) =>
          u.filename === file.name
            ? { ...u, mediaId: media.id, progress: 100, status: "processing" }
            : u
        )
      );

      return media;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setUploads((prev) =>
        prev.map((u) =>
          u.filename === file.name ? { ...u, status: "error", error: errorMessage } : u
        )
      );
      onError(errorMessage);
      throw err;
    }
  };

  // Process the files with a concurrency limit.
  const processUploadsWithLimit = async (
    files: File[],
    limit: number
  ): Promise<PromiseSettledResult<Media>[]> => {
    const results: PromiseSettledResult<Media>[] = new Array(files.length);
    let currentIndex = 0;

    // Each worker runs this function.
    const runNext = async () => {
      while (currentIndex < files.length) {
        const index = currentIndex;
        currentIndex++;
        try {
          const media = await uploadFileWithProgress(files[index]);
          results[index] = { status: "fulfilled", value: media };
        } catch (error) {
          results[index] = { status: "rejected", reason: error };
        }
      }
    };

    // Start as many workers as the limit (or fewer if not enough files).
    const workers = [];
    const workerCount = Math.min(limit, files.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(runNext());
    }
    await Promise.all(workers);
    return results;
  };

  // ─── END HELPER FUNCTIONS ──────────────────────────────────────────────────

  // Updated file upload handler using the concurrency queue.
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setShowUploadPanel(true);
    const filesArray = Array.from(files);

    try {
      // Process uploads with a maximum of 5 concurrent uploads.
      const results = await processUploadsWithLimit(filesArray, 5);

      // Filter successful uploads and update media items.
      const successfulMedia = results
        .filter(
          (result): result is PromiseFulfilledResult<Media> =>
            result.status === "fulfilled"
        )
        .map((result) => result.value);

      setMediaItems((prev) => [...prev, ...successfulMedia]);
    } catch (error) {
      console.error("Batch upload error:", error);
    }
  };

  const handleDeleteSphere = async () => {
    if (!sphereToDelete) return;

    try {
      await api.deleteSphere(palace.id, sphereToDelete.id);
      setSpheres((prev) => prev.filter((s) => s.id !== sphereToDelete.id));
      setMediaItems((prev) =>
        prev.filter((m) => m.sphereId !== sphereToDelete.id)
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete sphere");
    } finally {
      setSphereToDelete(null);
    }
  };

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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  console.log("Rendering with:", {
    spheresCount: spheres.length,
    mediaItemsCount: mediaItems.length,
    palaceId: palace.id,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {`Nodes: ${spheres.length}   Media Items: ${mediaItems.length}`}
        </h3>
        <div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mediaItems.map((media) => (
          <Card key={`media-${media.id}`} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div
                className={`absolute top-2 right-2 flex items-center gap-2 
          ${getStatusConfig(media.status).bgColor} 
          ${getStatusConfig(media.status).textColor} 
          px-2 py-1 rounded z-10`}
              >
                {React.createElement(getStatusConfig(media.status).Icon, {
                  className: `h-4 w-4 ${getStatusConfig(media.status).animate}`,
                })}
                <span>{getStatusConfig(media.status).text}</span>
              </div>

              <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4 relative">
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
                  <div className="flex items-center justify-center h-full w-full">
                    {media.status === "uploading" ||
                    media.status === "processing" ? (
                      <div className="text-center">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          {media.status === "uploading"
                            ? "Uploading..."
                            : "Processing..."}
                        </p>
                      </div>
                    ) : (
                      <div className="text-gray-400 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        <span>
                          {media.status === "error"
                            ? "Error loading media"
                            : "Thumbnail not available"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {media.type === "video" &&
                  media.duration &&
                  media.status === "ready" && (
                    <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
                      {Math.floor(media.duration / 60)}:
                      {String(Math.floor(media.duration % 60)).padStart(2, "0")}
                    </div>
                  )}
              </div>

              <div className="flex flex-col gap-2">
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
        ))}

        {spheres
          .filter((sphere) => !mediaItems.some((m) => m.sphereId === sphere.id))
          .map((sphere) => (
            <Card
              key={`sphere-${sphere.id}`}
              className="relative overflow-hidden"
            >
              <CardContent className="p-4">
                <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4">
                  <div className="text-gray-400 flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">No media</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="font-medium">
                    Sphere {sphere.id.slice(0, 8)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSphereToDelete(sphere)}
                    className="hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <AlertDialog
        open={!!sphereToDelete}
        onOpenChange={() => setSphereToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sphere</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this sphere? This action cannot be
              undone. Any associated media will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSphere}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!mediaToDelete}
        onOpenChange={() => setMediaToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this media item? This action cannot be undone.
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



// // OLD VERSION with no upload throttling
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
//   Sphere,
//   Media,
//   Palace,
//   MediaStatus,
//   UploadProgress,
// } from "../lib/types";

// interface SpheresGridProps {
//   palace: Palace;
//   api: ApiClient;
//   onError: (error: string) => void;
// }

// interface UploadState extends UploadProgress {
//   filename: string;
// }

// type StatusConfig = {
//   bgColor: string;
//   textColor: string;
//   Icon:
//     | typeof Upload
//     | typeof RefreshCw
//     | typeof AlertCircle
//     | typeof CheckCircle;
//   text: string;
//   animate: string;
// };

// export const SpheresGrid: React.FC<SpheresGridProps> = ({
//   palace,
//   api,
//   onError,
// }) => {
//   const [spheres, setSpheres] = useState<Sphere[]>([]);
//   const [mediaItems, setMediaItems] = useState<Media[]>([]);
//   const [uploads, setUploads] = useState<UploadState[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [sphereToDelete, setSphereToDelete] = useState<Sphere | null>(null);
//   const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
//   const [showUploadPanel, setShowUploadPanel] = useState(false);

//   const fetchData = useCallback(async () => {
//     if (!palace?.id) {
//       console.warn("No palace ID available");
//       return;
//     }

//     try {
//       console.log("Fetching data for palace:", palace.id);

//       const [spheresData, allMedia] = await Promise.all([
//         api.getSpheres(palace.id),
//         api.getMedia(),
//       ]);

//       console.log("Fetched all media:", allMedia);

//       // Filter media with null checks
//       const mediaData = allMedia.filter((m) => m && m.palaceId === palace.id);

//       console.log("Filtered media for palace:", mediaData);

//       setSpheres(spheresData || []);
//       setMediaItems(mediaData);
//     } catch (err) {
//       console.error("Fetch error:", err);
//       onError(err instanceof Error ? err.message : "Failed to fetch data");
//     } finally {
//       setIsLoading(false);
//     }
//   }, [api, palace?.id, onError]);

//   // Add useEffect dependency check
//   useEffect(() => {
//     if (palace?.id) {
//       fetchData();
//     }
//   }, [fetchData, palace?.id]);

//   // // Add the cleanup effect here
//   // useEffect(() => {
//   //     // Cleanup function to revoke blob URLs when component unmounts
//   //     return () => {
//   //       mediaItems.forEach(media => {
//   //         if (media) {
//   //           api.cleanupBlobUrl(media.url);
//   //           api.cleanupBlobUrl(media.thumbnailUrl);
//   //         }
//   //       });
//   //     };
//   //   }, [mediaItems, api]);  // Add api to dependencies

//   useEffect(() => {
//     fetchData();
//   }, [fetchData]);

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

//         const hasChanges = updates.some(
//           (update) =>
//             update.status !== mediaItems.find((m) => m.id === update.id)?.status
//         );

//         if (hasChanges) {
//           setMediaItems((prev) => {
//             const updated = [...prev];
//             updates.forEach((update) => {
//               const index = updated.findIndex((m) => m.id === update.id);
//               if (index !== -1) updated[index] = update;
//             });
//             return updated;
//           });

//           // Update the uploads state when media status changes
//           setUploads((prev) =>
//             prev.map((upload) => {
//               const matchingUpdate = updates.find(
//                 (u) => u.id === upload.mediaId
//               );
//               if (matchingUpdate) {
//                 return {
//                   ...upload,
//                   status: matchingUpdate.status,
//                   progress:
//                     matchingUpdate.status === "ready" ? 100 : upload.progress,
//                 };
//               }
//               return upload;
//             })
//           );

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

//   //New handle file upload to better handle concurrent uploads
//   const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
//     const files = event.target.files;
//     if (!files) return;
  
//     setShowUploadPanel(true);
  
//     // Create a stable reference for tracking uploads
//     const uploadTracker = new Map<string, string>(); // filename -> mediaId
  
//     const uploadPromises = Array.from(files).map(async (file) => {
//       try {
//         // Initialize upload state with unique identifier
//         const newUpload: UploadState = {
//           mediaId: "",
//           filename: file.name,
//           progress: 0,
//           status: "uploading",
//         };
  
//         setUploads((prev) => [...prev, newUpload]);
  
//         const media = await api.upload(file, palace.id, (progress) => {
//           // Track mediaId for this file
//           if (progress.mediaId) {
//             uploadTracker.set(file.name, progress.mediaId);
//           }
  
//           // Update progress maintaining correct status
//           setUploads((prev) =>
//             prev.map((u) =>
//               u.filename === file.name 
//                 ? { 
//                     ...u, 
//                     mediaId: progress.mediaId,
//                     progress: progress.progress,
//                     // Keep existing status unless explicitly changed
//                     status: u.status === "error" ? "error" : "uploading"
//                   } 
//                 : u
//             )
//           );
//         });
  
//         // After successful upload, update to processing state
//         setUploads((prev) =>
//           prev.map((u) =>
//             u.filename === file.name 
//               ? { 
//                   ...u, 
//                   mediaId: media.id,
//                   progress: 100,
//                   status: "processing"
//                 } 
//               : u
//           )
//         );
  
//         return media;
  
//       } catch (err) {
//         const error = err instanceof Error ? err.message : "Upload failed";
//         setUploads((prev) =>
//           prev.map((u) =>
//             u.filename === file.name 
//               ? { ...u, status: "error", error } 
//               : u
//           )
//         );
//         onError(error);
//       }
//     });
  
//     try {
//       const results = await Promise.allSettled(uploadPromises);
//       const successfulMedia = results
//         .filter((result): result is PromiseFulfilledResult<Media> => 
//           result.status === "fulfilled"
//         )
//         .map(result => result.value);
      
//       // Update media items state
//       setMediaItems(prev => [...prev, ...successfulMedia]);
  
//       // The existing useEffect polling mechanism will handle subsequent status updates
//       // as it's already designed to handle multiple media items
//     } catch (error) {
//       console.error('Batch upload error:', error);
//     }
//   };

//   const handleDeleteSphere = async () => {
//     if (!sphereToDelete) return;

//     try {
//       await api.deleteSphere(palace.id, sphereToDelete.id);
//       setSpheres((prev) => prev.filter((s) => s.id !== sphereToDelete.id));
//       setMediaItems((prev) =>
//         prev.filter((m) => m.sphereId !== sphereToDelete.id)
//       );
//     } catch (err) {
//       onError(err instanceof Error ? err.message : "Failed to delete sphere");
//     } finally {
//       setSphereToDelete(null);
//     }
//   };

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

//   {
//     /* Helper function for formatting file sizes */
//   }
//   const formatFileSize = (bytes: number): string => {
//     if (bytes === 0) return "0 B";
//     const k = 1024;
//     const sizes = ["B", "KB", "MB", "GB"];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
//   };

//   // Add debug rendering to help identify issues
//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center h-64">
//         <RefreshCw className="h-6 w-6 animate-spin" />
//       </div>
//     );
//   }
//   // Add debug info
//   console.log("Rendering with:", {
//     spheresCount: spheres.length,
//     mediaItemsCount: mediaItems.length,
//     palaceId: palace.id,
//   });

//   return (
//     <div className="space-y-6">
//       {/* Add debug info in UI */}
//       {/* <div className="text-sm text-gray-500">
//         {`Nodes: ${spheres.length}, Media Items: ${mediaItems.length}`}
//       </div> */}
//       <div className="flex justify-between items-center">
//         <h3 className="text-lg font-medium">
//           {" "}
//           {`Nodes: ${spheres.length}   Media Items: ${mediaItems.length}`}
//         </h3>
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

//       {/* Upload Progress Panel */}
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
//                       value={upload.status === "ready" ? 100 : upload.progress}
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

//       {/* Combined Spheres & Media Grid */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//         {/* Media Items */}
//         {mediaItems.map((media) => (
//           <Card key={`media-${media.id}`} className="relative overflow-hidden">
//             <CardContent className="p-4">
//               {/* Status badge */}
//               <div
//                 className={`absolute top-2 right-2 flex items-center gap-2 
//           ${getStatusConfig(media.status).bgColor} 
//           ${getStatusConfig(media.status).textColor} 
//           px-2 py-1 rounded z-10`}
//               >
//                 {React.createElement(getStatusConfig(media.status).Icon, {
//                   className: `h-4 w-4 ${getStatusConfig(media.status).animate}`,
//                 })}
//                 <span>{getStatusConfig(media.status).text}</span>
//               </div>

//               {/* Media Preview */}
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
//                   <div className="flex items-center justify-center h-full w-full">
//                     {media.status === "uploading" ||
//                     media.status === "processing" ? (
//                       <div className="text-center">
//                         <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
//                         <p className="text-sm text-gray-500">
//                           {media.status === "uploading"
//                             ? "Uploading..."
//                             : "Processing..."}
//                         </p>
//                       </div>
//                     ) : (
//                       <div className="text-gray-400 flex items-center gap-2">
//                         <AlertCircle className="h-5 w-5" />
//                         <span>
//                           {media.status === "error"
//                             ? "Error loading media"
//                             : "Thumbnail not available"}
//                         </span>
//                       </div>
//                     )}
//                   </div>
//                 )}

//                 {/* Video Duration Badge */}
//                 {media.type === "video" &&
//                   media.duration &&
//                   media.status === "ready" && (
//                     <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-0.5 rounded text-xs">
//                       {Math.floor(media.duration / 60)}:
//                       {String(Math.floor(media.duration % 60)).padStart(2, "0")}
//                     </div>
//                   )}
//               </div>

//               {/* Media Information */}
//               <div className="flex flex-col gap-2">
//                 {/* Title and Type Badge */}
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

//                 {/* Details */}
//                 <div className="text-sm text-gray-500">
//                   <div className="flex items-center gap-2">
//                     {/* Resolution if available */}
//                     {media.width && media.height && (
//                       <span>
//                         {media.width}×{media.height}
//                       </span>
//                     )}
//                     {/* File size */}
//                     <span>{formatFileSize(media.size)}</span>
//                   </div>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         ))}

//         {/* Empty Spheres */}
//         {spheres
//           .filter((sphere) => !mediaItems.some((m) => m.sphereId === sphere.id))
//           .map((sphere) => (
//             <Card
//               key={`sphere-${sphere.id}`}
//               className="relative overflow-hidden"
//             >
//               <CardContent className="p-4">
//                 <div className="aspect-video bg-gray-100 rounded flex items-center justify-center mb-4">
//                   <div className="text-gray-400 flex flex-col items-center gap-2">
//                     <Upload className="h-6 w-6" />
//                     <span className="text-sm">No media</span>
//                   </div>
//                 </div>

//                 <div className="flex justify-between items-center">
//                   <div className="font-medium">
//                     Sphere {sphere.id.slice(0, 8)}
//                   </div>
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     onClick={() => setSphereToDelete(sphere)}
//                     className="hover:bg-red-50 hover:text-red-500"
//                   >
//                     <Trash2 className="h-4 w-4" />
//                   </Button>
//                 </div>
//               </CardContent>
//             </Card>
//           ))}
//       </div>

//       {/* Delete Confirmation Dialog */}
//       <AlertDialog
//         open={!!sphereToDelete}
//         onOpenChange={() => setSphereToDelete(null)}
//       >
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Sphere</AlertDialogTitle>
//             <AlertDialogDescription>
//               Are you sure you want to delete this sphere? This action cannot be
//               undone. Any associated media will also be deleted.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction onClick={handleDeleteSphere}>
//               Delete
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>

//       {/* Add new Media Delete Dialog */}
//       <AlertDialog
//         open={!!mediaToDelete}
//         onOpenChange={() => setMediaToDelete(null)}
//       >
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Media</AlertDialogTitle>
//             <AlertDialogDescription>
//               Are you sure you want to delete this media item? This action cannot be
//               undone.
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
