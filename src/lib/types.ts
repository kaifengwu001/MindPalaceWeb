// src/lib/types.ts

export interface Vector3 {
    x: number;
    y: number;
    z: number;
  }
  
  export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
  }
  
  export interface Palace {
    id: string;
    userId: string;
    name: string;
    lastModified: number;
    spheres?: string[];
    description?: string;
  }
  
  export interface Sphere {
    id: string;
    palaceId: string;
    position: Vector3;
    rotation: Quaternion;
    scale: Vector3;
    mediaRef?: string;
    // VisionPro app uses associatedFileName to link spheres to media files
    associatedFileName?: string;
    description?: string;
    lastModified: number;
  }

  export type MediaStatus = 
  | 'pending'
  | 'uploading' 
  | 'processing' 
  | 'ready' 
  | 'error' 
  | 'deleted';

  
  export interface Media {
    id: string;
    userId: string;
    filename: string;
    contentType: string;
    size: number;
    uploadDate: number;
    type: "image" | "video" | "text";
    status: MediaStatus;
    palaceId?: string;
    sphereId?: string;
    processingJobId?: string;
    error?: string;
    url?: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
  }

  

  
  export interface AuthState {
    isAuthenticated: boolean;
    user?: {
      sub: string;
      email: string;
      accessToken: string;
    };
    error?: string;
  }
  
  export interface UploadProgress {
    mediaId: string;
    progress: number;
    status: MediaStatus;
    error?: string;
  }

  export interface Connection {
    id: string;
    palaceId: string;
    startObjectId: string;
    endObjectId: string;
    comment?: string;
    lastModified: number;
  }