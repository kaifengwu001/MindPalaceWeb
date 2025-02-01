//src/lib/api.ts
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import type {
  Palace,
  Sphere,
  Media,
  MediaStatus,
  UploadProgress,
} from "./types";

export interface ApiConfig {
  baseUrl: string;
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
}

export interface UploadRequest {
  filename: string;
  contentType: string;
  palaceId: string;
  sphereId?: string;
}

export interface S3UploadResponse {
  uploadUrl: string;
  mediaId: string;
  fields: Record<string, string>;
}

// First, update the MediaResponse interface to match the actual response:
export interface MediaResponse {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: number;
  lastModified: number;
  type: "image" | "video" | "text";
  status: MediaStatus;
  palaceId?: string;
  sphereId?: string;
  processingJobId?: string;
  error?: string;
  originalKey?: string;
  processedKey?: string;
  thumbnailKey?: string;
  duration?: number;
  width?: number;
  height?: number;
}




export interface MediaStatusResponse {
  url: string;
  thumbnailUrl: string;
  expires: number;
  metadata: MediaResponse;
}

export class ApiClient {
  private baseUrl: string;
  private uploadProgressCallbacks: Map<
    string,
    (progress: UploadProgress) => void
  >;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.uploadProgressCallbacks = new Map();

    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: config.userPoolId,
          userPoolClientId: config.userPoolWebClientId,
        },
      },
    });
  }

  private getUrl(path: string): string {
    // Ensure path starts with a single slash and combine with baseUrl
    const normalizedPath = path.replace(/^\/+/, "/");
    return `${this.baseUrl}${normalizedPath}`;
  }

  private async getHeaders(): Promise<Headers> {
    const { tokens } = await fetchAuthSession();
    const token = tokens?.idToken?.toString();

    if (!token) {
      throw new Error("No authentication token available");
    }

    return new Headers({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });
  }


  async get<T>(path: string): Promise<T> {
    const headers = await this.getHeaders();
    // Use getUrl to construct proper URL
    const response = await fetch(this.getUrl(path), {
      headers,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(this.getUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(this.getUrl(path), {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  async delete(path: string): Promise<void> {
    const headers = await this.getHeaders();
    const response = await fetch(this.getUrl(path), {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
  }

  async deleteMedia(mediaId: string): Promise<void> {
    return this.delete(`/media/${mediaId}`);
  }

  onUploadProgress(
    mediaId: string,
    callback: (progress: UploadProgress) => void
  ): void {
    this.uploadProgressCallbacks.set(mediaId, callback);
  }

  removeUploadProgressCallback(mediaId: string): void {
    this.uploadProgressCallbacks.delete(mediaId);
  }

  async upload(
    file: File,
    palaceId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Media> {
    try {
      console.log("Starting upload for:", file.name);

      // Step 1: Get pre-signed URL
      const uploadRequest: UploadRequest = {
        filename: file.name,
        contentType: file.type,
        palaceId,
      };

      console.log("Requesting upload URL...");
      const { uploadUrl, fields, mediaId } = await this.post<S3UploadResponse>(
        "/media/upload",
        uploadRequest
      );

      console.log("Received upload URL and fields:", { mediaId, uploadUrl });

      // Initial progress update
      onProgress?.({
        mediaId,
        progress: 0,
        status: "uploading",
      });

      // Step 2: Upload to S3 using multipart form
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append("file", file);

      console.log("Uploading to S3...");
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      console.log("Upload complete, waiting for processing...");

      // Upload complete, now processing
      onProgress?.({
        mediaId,
        progress: 100,
        status: "processing",
      });

      // Get initial media status
      const media = await this.getMediaStatus(mediaId);
      return media;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

// Then update the getMedia method to properly handle the type checking
// async getMedia(): Promise<Media[]> {
//   try {
//     const mediaList = await this.get<MediaResponse[]>('/media');
    
//     const mediaPromises = mediaList.map(async (item) => {
//       try {
//         const { url, thumbnailUrl } = await this.get<MediaStatusResponse>(`/media/${item.id}`);
        
//         const media: Media = {
//           id: item.id,
//           userId: item.userId,
//           filename: item.filename,
//           contentType: item.contentType,
//           size: item.size,
//           uploadDate: item.uploadDate,
//           type: item.type,
//           status: item.status,
//           palaceId: item.palaceId,
//           sphereId: item.sphereId,
//           processingJobId: item.processingJobId,
//           error: item.error,
//           url,
//           thumbnailUrl,
//           width: item.width,
//           height: item.height,
//           duration: item.duration
//         };
        
//         return media;
//       } catch (error) {
//         console.error(`Error getting pre-signed URLs for media ${item.id}:`, error);
//         return undefined;
//       }
//     });

//     const mediaResults = await Promise.all(mediaPromises);
//     return mediaResults.filter((item): item is Media => item !== undefined);
//   } catch (error) {
//     console.error('Error in getMedia:', error);
//     return [];
//   }
// }


async getMedia(): Promise<Media[]> {
  try {
    // 1. Fetch the main list of media items.
    const mediaList = await this.get<MediaResponse[]>("/media");

    // 2. For each item, attempt to fetch presigned URLs with exponential backoff.
    const results = await Promise.all(
      mediaList.map(async (item) => {
        let url: string | undefined;
        let thumbnailUrl: string | undefined;

        const RETRY_LIMIT = 3;
        const BASE_DELAY_MS = 150; // Base delay of 500ms; adjust as needed.
        let attempt = 0;
        let success = false;
        let lastError: unknown;

        while (!success && attempt < RETRY_LIMIT) {
          attempt++;
          try {
            const statusResp = await this.get<MediaStatusResponse>(`/media/${item.id}`);
            url = statusResp.url;
            thumbnailUrl = statusResp.thumbnailUrl;
            success = true;
          } catch (err) {
            lastError = err;
            console.warn(
              `Attempt ${attempt} failed for media item ${item.id}:`,
              err
            );
            // Exponential backoff: delay increases as 2^attempt * BASE_DELAY_MS.
            const delayTime = Math.pow(2, attempt) * BASE_DELAY_MS;
            await new Promise((resolve) => setTimeout(resolve, delayTime));
          }
        }

        if (!success) {
          console.error(
            `Failed to retrieve presigned URLs for media item ${item.id} after ${RETRY_LIMIT} attempts.`,
            lastError
          );
          // We retain the item even if the URL fetching failed.
          // The url and thumbnailUrl will remain undefined.
        }

        // 3. Return the combined media item.
        return {
          id: item.id,
          userId: item.userId,
          filename: item.filename,
          contentType: item.contentType,
          size: item.size,
          uploadDate: item.uploadDate,
          lastModified: item.lastModified,
          type: item.type,
          status: item.status,
          palaceId: item.palaceId,
          sphereId: item.sphereId,
          processingJobId: item.processingJobId,
          error: item.error,
          url,
          thumbnailUrl,
          duration: item.duration,
          width: item.width,
          height: item.height,
        } as Media;
      })
    );

    return results;
  } catch (error) {
    console.error("Error in getMedia:", error);
    return [];
  }
}

// Update getMediaStatus to use the same Media type
async getMediaStatus(mediaId: string): Promise<Media> {
  try {
    const response = await this.get<MediaStatusResponse>(`/media/${mediaId}`);
    const { metadata, url, thumbnailUrl } = response;

    const media: Media = {
      id: metadata.id,
      userId: metadata.userId,
      filename: metadata.filename,
      contentType: metadata.contentType,
      size: metadata.size,
      uploadDate: metadata.uploadDate,
      type: metadata.type,
      status: metadata.status,
      palaceId: metadata.palaceId,
      sphereId: metadata.sphereId,
      processingJobId: metadata.processingJobId,
      error: metadata.error,
      url,
      thumbnailUrl,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration
    };

    return media;
  } catch (error) {
    console.error('Error in getMediaStatus:', error);
    throw error;
  }
}



  async getSpheres(palaceId: string): Promise<Sphere[]> {
    return this.get<Sphere[]>(`/palaces/${palaceId}/spheres`);
  }

  async deleteSphere(palaceId: string, sphereId: string): Promise<void> {
    return this.delete(`/palaces/${palaceId}/spheres/${sphereId}`);
  }

  async getPalaces(): Promise<Palace[]> {
    return this.get<Palace[]>("/palaces");
  }

  async createPalace(name: string): Promise<Palace> {
    return this.post<Palace>("/palaces", { name });
  }

  async updatePalace(
    palaceId: string,
    updates: Partial<Palace>
  ): Promise<Palace> {
    return this.put<Palace>(`/palaces/${palaceId}`, updates);
  }

  cleanupBlobUrl(url: string | undefined) {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
}

export const createApiClient = (config: ApiConfig): ApiClient =>
  new ApiClient(config);
