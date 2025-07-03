import crypto from 'node:crypto';
import fs from 'node:fs';
import { basename, extname } from 'node:path';
import { UploadxClient } from '../src';

// Function to calculate MD5 checksum of a file
async function calculateMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Get MIME type based on file extension
const mimeMap = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'mp4': 'video/mp4',
} as { [key: string]: string };

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  return mimeMap[ext] || 'application/octet-stream';
}


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

  console.log(`Calculating MD5 checksum for ${filePath}...`);
  const md5Checksum = await calculateMD5(filePath);
  console.log(`MD5 Checksum: ${md5Checksum}`);

  // Create a new UploadxClient instance
  const uploadxClient = new UploadxClient({
    chunkSize: 8 * 1024 * 1024, // 8MB chunks
  });

  // Upload the file using fileUpload method
  await uploadxClient.fileUpload(
    endpoint,
    filePath,
    {
      name: `${basename(filePath)}`,
      size: stats.size,
      lastModified: stats.mtimeMs,
      mimeType: getMimeType(filePath),
      // Optionaly include the MD5 checksum in the metadata
      md5Checksum: md5Checksum,
    },
    (progress) => {
      console.log(`Upload progress: ${(progress * 100).toFixed(2)}%`);
    },
  );

  console.log('Upload completed successfully!');
}

void main().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
