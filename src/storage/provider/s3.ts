import { randomUUID } from 'crypto';
import { s3mini } from 's3mini';
import { storageConfig } from '../config/storage-config';
import {
  ConfigurationError,
  type DownloadAndUploadParams,
  DownloadError,
  type ListedObject,
  type StorageConfig,
  StorageError,
  type StorageProvider,
  UploadError,
  type UploadFileParams,
  type UploadFileResult,
} from '../types';

/**
 * Amazon S3 storage provider implementation using s3mini
 *
 * docs:
 * https://mksaas.com/docs/storage
 *
 * This provider works with Amazon S3 and compatible services like Cloudflare R2
 * using s3mini for better Cloudflare Workers compatibility
 * https://github.com/good-lly/s3mini
 * https://developers.cloudflare.com/r2/
 */
export class S3Provider implements StorageProvider {
  private config: StorageConfig;
  private s3Client: s3mini | null = null;

  constructor(config: StorageConfig = storageConfig) {
    this.config = config;
  }

  /**
   * Get the provider name
   */
  public getProviderName(): string {
    return 'S3';
  }

  /**
   * Get the S3 client instance
   */
  private getS3Client(): s3mini {
    if (this.s3Client) {
      return this.s3Client;
    }

    const { region, endpoint, accessKeyId, secretAccessKey, bucketName } =
      this.config;

    if (!region) {
      throw new ConfigurationError('Storage region is not configured');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new ConfigurationError('Storage credentials are not configured');
    }

    if (!endpoint) {
      throw new ConfigurationError('Storage endpoint is required for s3mini');
    }

    if (!bucketName) {
      throw new ConfigurationError('Storage bucket name is not configured');
    }

    // s3mini client configuration
    // The bucket name needs to be included in the endpoint URL for s3mini.
    // Some deployments configure STORAGE_ENDPOINT with the bucket suffix
    // already baked in (e.g. ".../omni"), others don't. Detect both so
    // we never end up double-prefixing keys with the bucket name —
    // which would otherwise land objects at `omni/...` under the bucket
    // root and 404 from any CDN bound to the bucket itself.
    const trimmedEndpoint = endpoint.replace(/\/$/, '');
    const endpointWithBucket = trimmedEndpoint.endsWith(`/${bucketName}`)
      ? trimmedEndpoint
      : `${trimmedEndpoint}/${bucketName}`;

    this.s3Client = new s3mini({
      accessKeyId,
      secretAccessKey,
      endpoint: endpointWithBucket,
      region,
    });

    return this.s3Client;
  }

  /**
   * Generate a unique filename with the original extension
   */
  private generateUniqueFilename(originalFilename: string): string {
    const extension = originalFilename.split('.').pop() || '';
    const uuid = randomUUID();
    return `${uuid}${extension ? `.${extension}` : ''}`;
  }

  /**
   * Build the public URL for a given storage key
   */
  private buildPublicUrl(key: string): string {
    const { publicUrl, endpoint } = this.config;

    if (publicUrl) {
      return `${publicUrl.replace(/\/$/, '')}/${key}`;
    }

    const baseUrl = endpoint?.replace(/\/$/, '') || '';
    return `${baseUrl}/${key}`;
  }

  /**
   * Upload a file to S3 with auto-generated unique filename
   */
  public async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const { file, filename, contentType, folder } = params;

    // Generate unique key
    const uniqueFilename = this.generateUniqueFilename(filename);
    const key = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;

    // Convert Blob to Buffer if needed
    const buffer =
      file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;

    return this.upload(key, buffer, contentType);
  }

  /**
   * Upload buffer to S3 with explicit key
   */
  public async upload(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<UploadFileResult> {
    try {
      const s3 = this.getS3Client();
      const response = await s3.putObject(key, body, contentType);

      if (!response.ok) {
        throw new UploadError(`Failed to upload: ${response.statusText}`);
      }

      const url = this.buildPublicUrl(key);
      return { url, key };
    } catch (error) {
      if (error instanceof ConfigurationError || error instanceof UploadError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Upload failed';
      throw new UploadError(message);
    }
  }

  /**
   * Download from URL and upload to S3
   */
  public async downloadAndUpload(
    params: DownloadAndUploadParams
  ): Promise<UploadFileResult> {
    const { url, key, contentType } = params;

    // Download file from URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new DownloadError(
        `Failed to download: ${response.status} ${response.statusText}`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Auto-detect contentType from response headers if not provided
    const mimeType =
      contentType ||
      response.headers.get('content-type') ||
      'application/octet-stream';

    return this.upload(key, buffer, mimeType);
  }

  /**
   * List objects with the given key prefix.
   *
   * Uses s3mini's ListObjectsV2 under the hood. s3mini accepts a
   * `delimiter` arg but only uses it to pick the request path, not as
   * an S3 query parameter — so the response is always a flat listing.
   * We pass '/' (its default) to keep the request URL well-formed.
   */
  public async listObjectsInFolder(
    prefix: string,
    maxKeys?: number
  ): Promise<ListedObject[]> {
    try {
      const s3 = this.getS3Client();
      const raw = await s3.listObjects('/', prefix, maxKeys);
      if (!raw || !Array.isArray(raw)) {
        return [];
      }

      // s3mini's XML parser lowercases the first char of each tag,
      // so ListObjectsV2 entries come back as { key, lastModified,
      // size, ... } rather than PascalCase. We still fall back to the
      // PascalCase variants in case s3mini ever changes back.
      const results: ListedObject[] = [];
      for (const item of raw as Array<Record<string, unknown>>) {
        const keyRaw = item.key ?? item.Key;
        const lastModifiedRaw = item.lastModified ?? item.LastModified;
        const sizeRaw = item.size ?? item.Size;

        const key = typeof keyRaw === 'string' ? keyRaw : null;
        if (!key) continue;

        const lastModified =
          lastModifiedRaw instanceof Date
            ? lastModifiedRaw
            : typeof lastModifiedRaw === 'string'
              ? new Date(lastModifiedRaw)
              : new Date(0);
        const size =
          typeof sizeRaw === 'number'
            ? sizeRaw
            : typeof sizeRaw === 'string'
              ? Number.parseInt(sizeRaw, 10) || 0
              : 0;

        results.push({ key, lastModified, size });
      }
      return results;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to list objects';
      throw new StorageError(message);
    }
  }

  /**
   * Delete a file from S3
   */
  public async deleteFile(key: string): Promise<void> {
    try {
      const s3 = this.getS3Client();

      const wasDeleted = await s3.deleteObject(key);

      if (!wasDeleted) {
        console.warn(
          `File with key ${key} was not found or could not be deleted`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during file deletion';
      console.error('deleteFile, error', message);
      throw new StorageError(message);
    }
  }
}
