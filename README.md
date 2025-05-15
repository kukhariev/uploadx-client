# UploadX Client

A JavaScript client for resumable file uploads with chunking support. Works with [node-uploadx](https://github.com/kukhariev/node-uploadx) server implementation.

## Features

- **Resumable Uploads**: Continue uploads from where they left off after interruptions
- **Chunked Uploads**: Split large files into manageable chunks
- **Progress Tracking**: Real-time upload progress monitoring
- **Cross-Platform**: Works in both browser and Node.js environments
- **Multiple Data Sources**: Support for File, Blob, Stream, Buffer, and more
- **Automatic Retries**: Built-in retry mechanism with exponential backoff
- **Cancellation**: Ability to abort ongoing uploads

## Installation

```bash
npm install @uploadx/client
```

## Usage

### Basic File Upload (Node.js)

```typescript
import { UploadxClient } from "@uploadx/client";
import fs from "node:fs";

async function uploadFile() {
  // Create a new client instance
  const client = new UploadxClient({
    chunkSize: 8 * 1024 * 1024, // 8MB chunks
  });

  const filePath = "./large-file.mp4";
  const stats = await fs.promises.stat(filePath);

  // Upload the file
  await client.fileUpload(
    "https://your-server.com/upload",
    filePath,
    {
      name: "uploaded-file.mp4",
      mimeType: "video/mp4",
      size: stats.size,
      lastModified: stats.mtimeMs,
    },
    (progress) => {
      console.log(`Upload progress: ${(progress * 100).toFixed(2)}%`);
    }
  );

  console.log("Upload completed successfully!");
}

uploadFile().catch(console.error);
```

### Browser Upload (with File object)

```typescript
import { UploadxClient } from "@uploadx/client";

async function uploadFile(file) {
  const client = new UploadxClient();

  await client.upload(
    "https://your-server.com/upload",
    file,
    {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      lastModified: file.lastModified,
    },
    (progress) => {
      updateProgressBar(progress);
    }
  );

  alert("Upload completed!");
}

// Example with file input
document.getElementById("fileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    uploadFile(file);
  }
});
```

### Manual Upload Session

You can manually create an upload session and then upload data to it. This is useful when you need more control over the upload process or when implementing custom upload workflows:

```typescript
import { UploadxClient } from "@uploadx/client";
import fs from "node:fs";

async function manualUploadSession() {
  const client = new UploadxClient();
  const filePath = "./large-file.mp4";

  // Get file stats for metadata
  const stats = await fs.promises.stat(filePath);

  // Define metadata
  const metadata = {
    name: "manual-upload.mp4",
    mimeType: "video/mp4",
    size: stats.size,
    lastModified: stats.mtimeMs,
  };

  try {
    // Create upload session
    const session = await client.createUpload(
      "https://your-server.com/upload",
      metadata
    );

    console.log(`Upload session created: ${session.url}`);
    console.log(`Already uploaded bytes: ${session.uploadedBytes || 0}`);

    // Now you can use the session URL to resume the upload
    if (session.uploadedBytes !== undefined) {
      console.log(`Resuming upload from byte ${session.uploadedBytes}`);
    }

    // For Node.js file uploads
    await client.resumeFileUpload(
      session.url,
      filePath,
      metadata,
      (progress) => {
        console.log(`Upload progress: ${(progress * 100).toFixed(2)}%`);
      }
    );

    console.log("Upload completed successfully!");
  } catch (error) {
    console.error("Upload session failed:", error);
  }
}

manualUploadSession().catch(console.error);
```

## API Reference

### `UploadxClient`

#### Constructor

```typescript
new UploadxClient(config?: UploadConfig)
```

**Parameters:**
- `config` (optional): Configuration options
  - `chunkSize`: Size of each chunk in bytes (default: 5MB)
  - `retryConfig`: Configuration for axios-retry
  - `requestConfig`: Configuration for axios requests

#### Methods

##### `fileUpload`

Uploads a file from disk (Node.js only).

```typescript
fileUpload(
  endpoint: string,
  filePath: string,
  metadata: UploadMetadata,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void>
```

##### `upload`

Uploads data from various sources (Blob, File, Stream, Buffer).

```typescript
upload(
  endpoint: string,
  data: Uploadable,
  metadata: UploadMetadata,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void>
```

##### `resumeUpload`

Resumes an upload from a previously created session.

```typescript
resumeUpload(
  url: string,
  data: Uploadable,
  metadata: UploadMetadata,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void>
```

##### `resumeFileUpload`

Resumes a file upload from disk (Node.js only).

```typescript
resumeFileUpload(
  url: string,
  filePath: string,
  metadata: UploadMetadata,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void>
```

##### `createUpload`

Creates a new upload session on the server.

```typescript
createUpload(
  endpoint: string,
  metadata: UploadMetadata,
  signal?: AbortSignal
): Promise<{ url: string; uploadedBytes?: number }>
```

##### `getUploadStatus`

Gets the current upload progress from the server.

```typescript
getUploadStatus(
  url: string,
  metadata?: Partial<UploadMetadata>,
  signal?: AbortSignal
): Promise<{ uploadedBytes: number }>
```

##### `deleteUpload`

Deletes an existing upload from the server.

```typescript
deleteUpload(url: string): Promise<void>
```

##### `abort`

Aborts all ongoing upload operations.

```typescript
abort(): void
```

## Types

### `UploadMetadata`

```typescript
interface UploadMetadata {
  name: string;
  mimeType?: string;
  size: number;
  lastModified?: number;
  [key: string]: unknown;
}
```

### `ProgressCallback`

```typescript
type ProgressCallback = (progress: number) => void;
```


## Examples

The repository includes example code to help you get started:

### Upload Client Example

`examples/client.ts` demonstrates how to upload a file with progress tracking:

```bash
ts-node examples/client.ts /path/to/file.mp4
```

### Browser Example

The repository includes a browser demo (`examples/browser/index.html`) that shows how to implement resumable uploads in web applications with progress tracking, session management, and upload controls (upload, abort, resume, delete).

## Server Requirements

This client is specifically designed to work with the [node-uploadx](https://github.com/kukhariev/node-uploadx) server implementation, which provides the necessary protocol support for resumable uploads.

## License

MIT
