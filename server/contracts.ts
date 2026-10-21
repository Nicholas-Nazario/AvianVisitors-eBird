/** Injectable I/O only: tests must preserve business logic. */
export interface HttpResult { status: number; body: Buffer; }
export type HttpTransport = (url: string, options: {headers?: Record<string,string>; timeoutMs: number}) => Promise<HttpResult>;
export interface EbirdConfig { lat: number; lng: number; dist: number; hotspot: unknown; back: number; token: string; }
export interface AppConfig {
  rootDir: string; dataDir: string; imageCacheDir: string; legacyImageCacheDir: string;
  rendererPath: string; corsOrigin: string; userAgent: string; timezone: string; ebird: EbirdConfig;
}
export interface ImageProcessor { process(input: Buffer): Promise<Buffer>; }
export interface Dependencies { config: AppConfig; now: () => Date; http: HttpTransport; imageProcessor?: ImageProcessor; }
export interface AppOptions { config?: AppConfig; now?: () => Date; http?: HttpTransport; imageProcessor?: ImageProcessor; }
