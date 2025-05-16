import { Readable } from 'node:stream';
import { jest } from '@jest/globals';
import { AbortError, UploadxClient } from '../client';

describe('Client.createUpload', () => {
  let client: UploadxClient;

  beforeEach(() => {
    client = new UploadxClient({
      chunkSize: 1024,
      retryConfig: {
        retries: 0,
      },
    });
  });

  it('should create upload session successfully', async () => {
    const mockPost = jest.spyOn(client['client'], 'post').mockResolvedValue({
      headers: {
        location: '/upload/123',
        range: 'bytes=0-1023',
      },
    });

    const result = await client.createUpload('http://test.com/upload/', {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
    });

    expect(mockPost).toHaveBeenCalledWith(
      'http://test.com/upload/',
      {
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 1024,
      },
      {
        headers: {
          'X-Upload-Content-Length': 1024,
          'X-Upload-Content-Type': 'text/plain',
          'Content-Type': 'application/json',
        },
        signal: undefined,
      },
    );
    expect(result.url).toBe('http://test.com/upload/123');
    expect(result.uploadedBytes).toBe(1024);
  });

  it('should use default mime type when not provided', async () => {
    const mockPost = jest.spyOn(client['client'], 'post').mockResolvedValue({
      headers: {
        location: '/upload/123',
      },
    });

    await client.createUpload('http://test.com/upload/', {
      name: 'test.txt',
      size: 1024,
    });

    expect(mockPost).toHaveBeenCalledWith(
      'http://test.com/upload/',
      {
        name: 'test.txt',
        size: 1024,
      },
      {
        headers: {
          'X-Upload-Content-Length': 1024,
          'X-Upload-Content-Type': 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        signal: undefined,
      },
    );
  });

  it('should handle missing location header', async () => {
    jest.spyOn(client['client'], 'post').mockResolvedValue({
      headers: {},
    });

    await expect(
      client.createUpload('http://test.com/upload/', {
        name: 'test.txt',
        size: 1024,
      }),
    ).rejects.toThrow('Missing Location header in response');
  });

  it('should handle abort signal', async () => {
    const abortSignal = new AbortController().signal;
    const mockPost = jest.spyOn(client['client'], 'post').mockResolvedValue({
      headers: {
        location: '/upload/123',
      },
    });

    await client.createUpload(
      'http://test.com/upload/',
      {
        name: 'test.txt',
        size: 1024,
      },
      abortSignal,
    );

    expect(mockPost).toHaveBeenCalledWith(
      'http://test.com/upload/',
      {
        name: 'test.txt',
        size: 1024,
      },
      {
        headers: {
          'X-Upload-Content-Length': 1024,
          'X-Upload-Content-Type': 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        signal: abortSignal,
      },
    );
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    jest.spyOn(client['client'], 'post').mockRejectedValue(networkError);

    await expect(
      client.createUpload('http://test.com/upload/', {
        name: 'test.txt',
        size: 1024,
      }),
    ).rejects.toThrow('Session creation failed');
  });
});
describe('Client.getUploadStatus', () => {
  let client: UploadxClient;

  beforeEach(() => {
    client = new UploadxClient({
      chunkSize: 1024,
      retryConfig: {
        retries: 0,
      },
    });
  });

  it('should get upload status with size metadata', async () => {
    const mockPut = jest.spyOn(client['client'], 'put').mockResolvedValue({
      headers: {
        range: 'bytes=0-999',
      },
    });

    const result = await client.getUploadStatus('http://test.com/upload/123', {
      size: 2048,
    });

    expect(mockPut).toHaveBeenCalledWith('http://test.com/upload/123', null, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': 'bytes */2048',
      },
      signal: undefined,
    });
    expect(result.uploadedBytes).toBe(1000);
  });

  it('should get upload status without size metadata', async () => {
    const mockPut = jest.spyOn(client['client'], 'put').mockResolvedValue({
      headers: {
        range: 'bytes=0-499',
      },
    });

    const result = await client.getUploadStatus('http://test.com/upload/123');

    expect(mockPut).toHaveBeenCalledWith('http://test.com/upload/123', null, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': 'bytes */*',
      },
      signal: undefined,
    });
    expect(result.uploadedBytes).toBe(500);
  });

  it('should handle missing range header', async () => {
    jest.spyOn(client['client'], 'put').mockResolvedValue({
      headers: {},
    });

    const result = await client.getUploadStatus('http://test.com/upload/123');
    expect(result.uploadedBytes).toBe(0);
  });

  it('should handle abort signal', async () => {
    const abortSignal = new AbortController().signal;
    const mockPut = jest.spyOn(client['client'], 'put').mockResolvedValue({
      headers: {
        range: 'bytes=0-99',
      },
    });

    await client.getUploadStatus('http://test.com/upload/123', {}, abortSignal);

    expect(mockPut).toHaveBeenCalledWith('http://test.com/upload/123', null, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': 'bytes */*',
      },
      signal: abortSignal,
    });
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    jest.spyOn(client['client'], 'put').mockRejectedValue(networkError);

    await expect(
      client.getUploadStatus('http://test.com/upload/123'),
    ).rejects.toThrow();
  });
});
describe('Client.resumeUpload', () => {
  let client: UploadxClient;

  beforeEach(() => {
    client = new UploadxClient({
      chunkSize: 1024,
      retryConfig: {
        retries: 0,
      },
    });
  });

  it('should resume upload for Blob data', async () => {
    const mockGetStatus = jest
      .spyOn(client, 'getUploadStatus')
      .mockResolvedValue({
        uploadedBytes: 512,
      });

    const mockUploadBlob = jest
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      .spyOn(client as any, 'uploadBlobInChunks')
      .mockResolvedValue(undefined);
    const blob = new Blob(['test data'], { type: 'text/plain' });
    const metadata = {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 2048,
      lastModified: Date.now(),
    };
    const progressCallback = jest.fn();

    await client.resumeUpload(
      'http://test.com/upload/123',
      blob,
      metadata,
      progressCallback,
    );

    expect(mockGetStatus).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      metadata,
      undefined,
    );
    expect(mockUploadBlob).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      blob,
      512,
      2048,
      progressCallback,
      undefined,
    );
  });

  it('should resume upload for ReadableStream data', async () => {
    const mockGetStatus = jest
      .spyOn(client, 'getUploadStatus')
      .mockResolvedValue({
        uploadedBytes: 256,
      });
    const mockUploadStream = jest
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      .spyOn(client as any, 'uploadStreamInChunks')
      .mockResolvedValue(undefined);
    const stream = new Readable({ read() {} });
    const metadata = {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
    };

    await client.resumeUpload('http://test.com/upload/123', stream, metadata);

    expect(mockGetStatus).toHaveBeenCalled();
    expect(mockUploadStream).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      stream,
      256,
      1024,
      undefined,
      undefined,
    );
  });

  it('should resume upload for Buffer data', async () => {
    const mockGetStatus = jest
      .spyOn(client, 'getUploadStatus')
      .mockResolvedValue({
        uploadedBytes: 0,
      });
    const mockUploadBuffer = jest
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      .spyOn(client as any, 'uploadBufferInChunks')
      .mockResolvedValue(undefined);
    const buffer = Buffer.from('test data');
    const metadata = {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
    };

    await client.resumeUpload('http://test.com/upload/123', buffer, metadata);

    expect(mockGetStatus).toHaveBeenCalled();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      buffer,
      0,
      1024,
      undefined,
      undefined,
    );
  });

  it('should handle abort signal gracefully', async () => {
    const abortController = new AbortController();
    const mockGetStatus = jest
      .spyOn(client, 'getUploadStatus')
      .mockRejectedValue(new AbortError());
    const metadata = {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
    };

    await client.resumeUpload(
      'http://test.com/upload/123',
      Buffer.from('test'),
      metadata,
      undefined,
      abortController.signal,
    );

    expect(mockGetStatus).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      metadata,
      abortController.signal,
    );
  });

  it('should throw error for upload failures', async () => {
    const mockGetStatus = jest
      .spyOn(client, 'getUploadStatus')
      .mockRejectedValue(new Error('Network error'));
    const metadata = {
      name: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
    };

    await expect(
      client.resumeUpload(
        'http://test.com/upload/123',
        Buffer.from('test'),
        metadata,
      ),
    ).rejects.toThrow('Upload failed');
  });
});
describe('Client.updateUpload', () => {
  let client: UploadxClient;

  beforeEach(() => {
    client = new UploadxClient({
      chunkSize: 1024,
      retryConfig: {
        retries: 0,
      },
    });
  });

  it('should successfully update upload metadata', async () => {
    const mockPatch = jest
      .spyOn(client['client'], 'patch')
      .mockResolvedValue({});
    const metadata = {
      name: 'updated.txt',
      version: '2.0',
    };

    await client.updateUpload('http://test.com/upload/123', metadata);

    expect(mockPatch).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      metadata,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: undefined,
      },
    );
  });

  it('should handle empty metadata update', async () => {
    const mockPatch = jest
      .spyOn(client['client'], 'patch')
      .mockResolvedValue({});
    const metadata = {};

    await client.updateUpload('http://test.com/upload/123', metadata);

    expect(mockPatch).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      metadata,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: undefined,
      },
    );
  });

  it('should handle abort signal during metadata update', async () => {
    const mockPatch = jest
      .spyOn(client['client'], 'patch')
      .mockResolvedValue({});
    const abortSignal = new AbortController().signal;
    const metadata = {
      name: 'updated.txt',
    };

    await client.updateUpload(
      'http://test.com/upload/123',
      metadata,
      abortSignal,
    );

    expect(mockPatch).toHaveBeenCalledWith(
      'http://test.com/upload/123',
      metadata,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortSignal,
      },
    );
  });

  it('should throw error with custom message on network failure', async () => {
    const networkError = new Error('Network error');
    jest.spyOn(client['client'], 'patch').mockRejectedValue(networkError);
    const metadata = {
      name: 'updated.txt',
    };

    await expect(
      client.updateUpload('http://test.com/upload/123', metadata),
    ).rejects.toThrow('Failed to update metadata');
  });

  it('should handle server errors with appropriate error message', async () => {
    const serverError = new Error('Internal Server Error');
    jest.spyOn(client['client'], 'patch').mockRejectedValue(serverError);
    const metadata = {
      name: 'updated.txt',
    };

    await expect(
      client.updateUpload('http://test.com/upload/123', metadata),
    ).rejects.toThrow('Failed to update metadata');
  });
});
