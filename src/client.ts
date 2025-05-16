import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';
import axiosRetry, {
  type IAxiosRetryConfig,
  exponentialDelay,
} from 'axios-retry';

export type Uploadable =
  | File
  | Blob
  | NodeJS.ReadableStream
  | ArrayBuffer
  | Uint8Array;

/**
 * Represents metadata for upload operations
 */
export interface UploadMetadata {
  /** The name of the content being uploaded */
  name: string;
  /** The MIME type of the content */
  mimeType?: string;
  /**  The size of the content in bytes */
  size: number;
  /** Optional timestamp of when the content was last modified*/
  lastModified?: number;
  // Optional data associated with the upload
  [key: string]: unknown;
}

export type ProgressCallback = (progress: number) => void;

export interface UploadConfig {
  chunkSize?: number;
  retryConfig?: IAxiosRetryConfig;
  requestConfig?: AxiosRequestConfig;
}

const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

export class AbortError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Client for handling resumable file uploads
 *
 * Supports chunked uploads with progress tracking, resuming interrupted uploads,
 * and works in both browser and Node.js environments.
 */
export class UploadxClient {
  private client: AxiosInstance;
  private chunkSize: number;
  private abortController = new AbortController();

  /**
   * Creates a new UploadxClient instance
   * @param config - Configuration options for chunk size, retry behavior, and axios settings
   */
  constructor(config: UploadConfig = {}) {
    this.chunkSize = config.chunkSize || 5 * 1024 * 1024;

    this.client = axios.create({
      maxBodyLength: Number.POSITIVE_INFINITY,
      maxContentLength: Number.POSITIVE_INFINITY,
      timeout: 60000,
      validateStatus: (status) =>
        (status >= 200 && status < 400) || status === 308,
      signal: this.abortController.signal,
      ...config.requestConfig,
    });

    axiosRetry(this.client, {
      retries: 5,
      retryDelay: exponentialDelay,
      retryCondition: (error) => {
        const isNetworkError =
          axiosRetry.isNetworkError(error) ||
          (error as AxiosError & { code?: string }).code === 'ECONNRESET';
        return (
          isNetworkError ||
          axiosRetry.isRetryableError(error) ||
          error.response?.status === 429 ||
          (error.response?.status || 0) >= 500
        );
      },
      ...config.retryConfig,
    });
  }

  /**
   * Aborts all ongoing upload operations
   * Cancels any in-progress uploads initiated by this client instance
   */
  abort(): void {
    this.abortController.abort();
    // Create a new controller for future operations
    this.abortController = new AbortController();
  }

  /**
   * Deletes an existing upload from the server
   */
  async deleteUpload(url: string, signal?: AbortSignal): Promise<void> {
    try {
      await this.client.delete(url, { signal });
    } catch (error) {
      this.handleError(error, 'Failed to delete upload');
    }
  }

  /**
   *
   * Updates the metadata of an existing upload
   */
  async updateUpload(
    url: string,
    metadata: Partial<UploadMetadata>,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.patch(url, metadata, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });
    } catch (error) {
      throw this.handleError(error, 'Failed to update metadata');
    }
  }

  /**
   * Creates a new upload session on the server
   */
  async createUpload(
    endpoint: string,
    metadata: UploadMetadata,
    signal?: AbortSignal,
  ): Promise<{ url: string; uploadedBytes?: number }> {
    try {
      const response = await this.client.post(endpoint, metadata, {
        headers: {
          'X-Upload-Content-Length': metadata.size,
          'X-Upload-Content-Type':
            metadata.mimeType || 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.headers.location) {
        throw new Error('Missing Location header in response');
      }
      const rangeHeader = response?.headers?.range as string | undefined;
      return {
        url: new URL(response.headers.location as string, endpoint).toString(),
        uploadedBytes: this.parseRangeHeader(rangeHeader),
      };
    } catch (error) {
      throw this.handleError(error, 'Session creation failed');
    }
  }

  /**
   * Creates an upload session for a file in Node.js environment
   */
  async createFileUpload(
    filePath: string,
    metadata: UploadMetadata,
    endpoint: string,
    signal: AbortSignal | undefined,
  ): Promise<{ url: string; uploadedBytes?: number }> {
    if (!isNode) {
      throw new Error('uploadAsFile is only available in Node.js environment');
    }
    const fsPromises = await import('node:fs/promises');
    const stats = await fsPromises.stat(filePath);
    const fileSize = stats.size;
    const actualMetadata = {
      ...metadata,
      size: fileSize,
      lastModified: metadata.lastModified || stats.mtimeMs,
    };

    return this.createUpload(endpoint, actualMetadata, signal);
  }

  /**
   * Uploads a file from disk (Node.js only)
   */
  async fileUpload(
    endpoint: string,
    filePath: string,
    metadata: UploadMetadata,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const session = await this.createFileUpload(
        filePath,
        metadata,
        endpoint,
        signal,
      );
      const sessionUrl = session.url;
      const start = session.uploadedBytes || 0;
      const totalSize = metadata.size;

      await this.uploadFileInChunks(
        sessionUrl,
        filePath,
        start,
        totalSize,
        onProgress,
        signal,
      );
    } catch (error) {
      // Don't throw if the operation was aborted
      if (error instanceof AbortError) {
        return;
      }

      throw this.handleError(error, `File upload failed for ${filePath}`);
    }
  }

  /**
   * Uploads data from various sources (Blob, File, Stream, Buffer)
   */
  async upload(
    endpoint: string,
    data: Uploadable,
    metadata: UploadMetadata,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const session = await this.createUpload(endpoint, metadata, signal);
      const start = session.uploadedBytes || 0;
      const totalSize = metadata.size;

      if (this.isBlob(data)) {
        await this.uploadBlobInChunks(
          session.url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      } else if (this.isStream(data)) {
        await this.uploadStreamInChunks(
          session.url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      } else {
        await this.uploadBufferInChunks(
          session.url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      }
    } catch (error) {
      // Don't throw if the operation was aborted
      if (error instanceof AbortError) {
        return;
      }

      throw this.handleError(error, 'Upload failed');
    }
  }

  /**
   * Resumes an upload from a previously created session
   */
  async resumeUpload(
    url: string,
    data: Uploadable,
    metadata: UploadMetadata,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const response = await this.getUploadStatus(url, metadata, signal);
      const start = response.uploadedBytes;
      const totalSize = metadata.size;

      if (this.isBlob(data)) {
        await this.uploadBlobInChunks(
          url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      } else if (this.isStream(data)) {
        await this.uploadStreamInChunks(
          url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      } else {
        await this.uploadBufferInChunks(
          url,
          data,
          start,
          totalSize,
          onProgress,
          signal,
        );
      }
    } catch (error) {
      // Don't throw if the operation was aborted
      if (error instanceof AbortError) {
        return;
      }

      throw this.handleError(error, 'Upload failed');
    }
  }

  /**
   * Resumes a file upload from disk (Node.js only)
   */
  async resumeFileUpload(
    url: string,
    filePath: string,
    metadata: UploadMetadata,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!isNode) {
      throw new Error('uploadAsFile is only available in Node.js environment');
    }

    try {
      const response = await this.getUploadStatus(url, metadata, signal);
      const start = response.uploadedBytes;
      const totalSize = metadata.size;

      await this.uploadFileInChunks(
        url,
        filePath,
        start,
        totalSize,
        onProgress,
        signal,
      );
    } catch (error) {
      // Don't throw if the operation was aborted
      if (error instanceof AbortError) {
        return;
      }

      throw this.handleError(error, `File upload failed for ${filePath}`);
    }
  }

  /**
   * Gets the current upload progress from the server
   */
  async getUploadStatus(
    url: string,
    metadata?: Partial<UploadMetadata>,
    signal?: AbortSignal,
  ): Promise<{ uploadedBytes: number }> {
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes */${metadata?.size || '*'}`,
    };

    const response = await this.client.put(url, null, {
      headers,
      signal,
    });
    const rangeHeader = response?.headers?.range as string | undefined;
    const uploadedBytes = this.parseRangeHeader(rangeHeader);

    return { uploadedBytes };
  }

  private async uploadChunk(
    url: string,
    data: Blob | Uint8Array | NodeJS.ReadableStream,
    start: number,
    end: number,
    totalSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<{ uploadedBytes: number }> {
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end - 1}/${totalSize}`,
    };

    const response = await this.client.put(url, data, {
      headers,
      signal,
      onUploadProgress: onProgress
        ? (progressEvent) => {
            const chunkUploaded = progressEvent.loaded;
            const totalUploaded = start + chunkUploaded;
            const progress = totalUploaded / totalSize;
            onProgress(Math.min(progress, 1));
          }
        : undefined,
    });
    const rangeHeader = response?.headers?.range as string | undefined;
    const uploadedBytes = this.parseRangeHeader(rangeHeader);

    return { uploadedBytes };
  }

  private async uploadFileInChunks(
    url: string,
    filePath: string,
    start: number,
    totalSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!isNode) {
      throw new Error('uploadAsFile is only available in Node.js environment');
    }

    const { createReadStream } = await import('node:fs');

    let position = start;
    while (position < totalSize) {
      // Check if the operation was aborted
      if (signal?.aborted) {
        throw new AbortError();
      }

      const end = Math.min(position + this.chunkSize, totalSize);

      const fileChunk = createReadStream(filePath, {
        start: position,
        end: end,
      });

      const result = await this.uploadChunk(
        url,
        fileChunk,
        position,
        end,
        totalSize,
        onProgress,
        signal,
      );

      position = end;

      if (result.uploadedBytes !== undefined) {
        const newPosition = result.uploadedBytes;
        if (newPosition > position) {
          position = newPosition;
        }
      }
    }
  }

  private async uploadBlobInChunks(
    url: string,
    blob: Blob | File,
    start: number,
    totalSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    let position = start;
    while (position < totalSize) {
      // Check if the operation was aborted
      if (signal?.aborted) {
        throw new AbortError();
      }

      const end = Math.min(position + this.chunkSize, totalSize);
      const chunk = blob.slice(position, end);

      await this.uploadChunk(
        url,
        chunk,
        position,
        end,
        totalSize,
        onProgress,
        signal,
      );
      position = end;
    }
  }

  private async uploadStreamInChunks(
    url: string,
    stream: NodeJS.ReadableStream,
    start: number,
    totalSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!isNode) {
      throw new Error(
        'Stream uploads are only available in Node.js environment',
      );
    }

    let position = start;
    let chunks: Buffer[] = [];
    let chunksSize = 0;

    return new Promise((resolve, reject) => {
      // Set up abort handler
      const abortHandler: () => void = () => {
        reject(new AbortError());
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler);
      }

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        chunksSize += chunk.length;

        while (chunksSize >= this.chunkSize) {
          const end = Math.min(position + this.chunkSize, totalSize);
          const chunkBuffer = Buffer.concat(chunks);
          chunks = [chunkBuffer.slice(end - position)];
          chunksSize = chunkBuffer.length - (end - position);
          stream.pause();

          this.uploadChunk(
            url,
            chunkBuffer.slice(0, end - position),
            position,
            end,
            totalSize,
            onProgress,
            signal,
          )
            .then((range) => {
              position = end;
              stream.resume();
            })
            .catch((error) => {
              // stream.destroy(error);
              reject(error);
            });
        }
      });

      stream.on('end', async () => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }

        if (chunks.length > 0) {
          // Check if the operation was aborted
          if (signal?.aborted) {
            reject(new AbortError());
            return;
          }

          const end = Math.min(position + chunksSize, totalSize);
          const chunkBuffer = Buffer.concat(chunks);

          try {
            await this.uploadChunk(
              url,
              chunkBuffer,
              position,
              end,
              totalSize,
              onProgress,
              signal,
            );
            position += chunksSize;
          } catch (error) {
            reject(error);
            return;
          }
        }

        resolve();
      });

      stream.on('error', (error) => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        reject(error);
      });
    });
  }

  private async uploadBufferInChunks(
    url: string,
    buffer: ArrayBuffer | Uint8Array,
    start: number,
    totalSize: number,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    const view =
      buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let position = start;

    while (position < totalSize) {
      // Check if the operation was aborted
      if (signal?.aborted) {
        throw new AbortError();
      }

      const end = Math.min(position + this.chunkSize, totalSize);
      const chunk = view.subarray(position, end);

      await this.uploadChunk(
        url,
        chunk,
        position,
        end,
        totalSize,
        onProgress,
        signal,
      );
      position = end;
    }
  }

  private isBlob(data: unknown): data is Blob {
    return typeof Blob !== 'undefined' && data instanceof Blob;
  }

  private isStream(data: unknown): data is NodeJS.ReadableStream {
    return !!data && typeof (data as NodeJS.ReadableStream).pipe === 'function';
  }

  private parseRangeHeader(range?: string): number {
    if (!range) return 0;
    const matches = range.match(/bytes=\d+-(\d+)/);

    return matches ? Number.parseInt(matches[1], 10) + 1 : 0;
  }

  private handleError(error: unknown, context: string): Error {
    if (error instanceof AbortError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      return new Error(
        `${context}: ${error.message} ${error.response?.data?.error?.message || error.cause} `,
      );
    }
    if (error instanceof Error) {
      return new Error(`${context}: ${error.message}`);
    }
    return new Error(context);
  }
}
