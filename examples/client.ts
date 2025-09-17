import fs from 'node:fs';
import { basename, extname } from 'node:path';
import { UploadxClient } from '../src';

async function main() {
  const endpoint = process.env.UPLOADX_ENDPOINT || 'http://localhost:3002/files';

  const filePath = process.argv[2] || process.env.UPLOADX_EXAMPLE_FILE_PATH || './upload/test.mp4';

  // Check if a file path was provided and if it exists
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Get file stats for metadata
  const stats = await fs.promises.stat(filePath);

  if (stats.isDirectory()) {
    console.error(`${filePath} is a directory, not a file.`);
    process.exit(1);
  }

  // Get MIME type based on file extension
  const mimeMap = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    mp4: 'video/mp4',
  } as { [key: string]: string };

  function getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase().slice(1);
    return mimeMap[ext] || 'application/octet-stream';
  }

  // Create a new UploadxClient instance
  const uploadxClient = new UploadxClient({
    chunkSize: 8 * 1024 * 1024, // 8MB chunks
  });

  const fileStream = fs.createReadStream(filePath);

  // Upload the file using  upladxClient.upload
  await uploadxClient.upload(endpoint, fileStream, {
    name: basename(filePath),
    mimeType: getMimeType(filePath),
    size: stats.size,
  });
}

void main().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
