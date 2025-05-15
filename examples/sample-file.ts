import fs from 'node:fs';
import path from 'node:path';

const filePath =
  process.argv[2] ||
  process.env.UPLOADX_EXAMPLE_FILE_PATH ||
  './upload/test.mp4';

fs.mkdirSync(path.dirname(filePath), { recursive: true });

const totalSize: number = 1024 * 1024 * 1024; // 1GB
const bufferSize: number = 1024 * 1024; // 1MB

const blockCount: number = Math.ceil(totalSize / bufferSize);

const fileStream: fs.WriteStream = fs.createWriteStream(filePath);

const buffer: Buffer = Buffer.alloc(bufferSize);
for (let i = 0; i < bufferSize; i++) {
  buffer[i] = i % 256;
}

for (let i = 0; i < blockCount; i++) {
  fileStream.write(buffer);
}
fileStream.end((): void => {
  console.log(`File created: ${filePath}`);
});

export { filePath };
