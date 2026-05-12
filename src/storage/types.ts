/**
 * Storage configuration
 */
export interface StorageConfig {
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
  forcePathStyle?: boolean;
}

/**
 * Storage provider error types
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ConfigurationError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class UploadError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export class DownloadError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/**
 * Upload file parameters
 */
export interface UploadFileParams {
  file: Buffer | Blob;
  filename: string;
  contentType: string;
  folder?: string;
}

/**
 * Upload file result
 */
export interface UploadFileResult {
  url: string;
  key: string;
}

/**
 * Download and upload parameters (compatible with veo3)
 */
export interface DownloadAndUploadParams {
  url: string;
  key: string;
  contentType?: string;
}

/**
 * Listed object metadata (subset of S3 ListObjectsV2 result entry)
 */
export interface ListedObject {
  key: string;
  lastModified: Date;
  size: number;
}

/**
 * Storage provider interface
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   */
  uploadFile(params: UploadFileParams): Promise<UploadFileResult>;

  /**
   * Delete a file from storage
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Get the provider's name
   */
  getProviderName(): string;

  /**
   * Simple upload method (compatible with veo3)
   * @param key - The storage key/path for the file
   * @param body - The file content as Buffer
   * @param contentType - MIME type of the file
   */
  upload(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<UploadFileResult>;

  /**
   * Download from URL and upload to storage (compatible with veo3)
   * @param params - Download and upload parameters
   */
  downloadAndUpload(params: DownloadAndUploadParams): Promise<UploadFileResult>;

  /**
   * List objects whose keys start with the given prefix.
   * Used by cleanup jobs. When `maxKeys` is set the listing stops as
   * soon as that many entries have been collected; omit it to let
   * the provider page through everything.
   */
  listObjectsInFolder(
    prefix: string,
    maxKeys?: number
  ): Promise<ListedObject[]>;
}
