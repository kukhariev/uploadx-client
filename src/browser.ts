import { UploadxClient } from './client.js';

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
(window as any).UploadxClient = UploadxClient;

// Экспортируем только по умолчанию для UMD
export default UploadxClient;
