import { UploadxClient } from './client.js';

// biome-ignore lint/suspicious/noExplicitAny:  make public
(window as any).UploadxClient = UploadxClient;

export default UploadxClient;
