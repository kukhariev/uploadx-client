import crypto from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ERRORS, type LogLevel, fail, uploadx } from '@uploadx/core';
import express from 'express';

const PORT = process.env.PORT || 3002;
const app = express();
const uploadDir = process.env.UPLOAD_DIR || `${tmpdir()}/uploadx-client-uploaded/`;

const uploads = uploadx({
  directory: uploadDir,
  allowMIME: process.env.ALLOW_MIME?.split(',') || ['*/*'],
  maxUploadSize: process.env.MAX_UPLOAD_SIZE || '10GB',
  filename: (file) => `[uploaded]-${file.originalName}`,
  logLevel: <LogLevel>process.env.LOG_LEVEL || 'error',
  onComplete: async (file) => {
    console.log('File upload complete: ', file);
    if (file.metadata?.md5Checksum && typeof file.metadata.md5Checksum === 'string') {
      const originalMd5Checksum = file.metadata.md5Checksum.trim().toLowerCase();
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(path.resolve(uploadDir, file.name));

      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve('ok'));
        stream.on('error', reject);
      });
      const md5Checksum = hash.digest('hex').trim().toLowerCase();
      if (originalMd5Checksum !== md5Checksum) {
        return fail(ERRORS.CHECKSUM_MISMATCH, 'MD5 checksum mismatch');
      }
      console.log('File MD5: ', md5Checksum);
    }
    return file;
  },
});

app.use(express.static(path.join(__dirname, '../lib/browser')));
app.use(express.static(path.join(__dirname, 'browser')));

app.use('/files', uploads);



app.listen(PORT, () => {
  console.log('\x1b[32m', `Server is running on port \x1b[34m${PORT}\x1b[0m`, '\x1b[0m');
  console.log('\x1b[32m', `For web client demo, open \x1b[34mhttp://localhost:${PORT}/index.html\x1b[0m`, '\x1b[0m');
});
