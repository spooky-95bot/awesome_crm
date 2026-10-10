// src/modules/integrations/http/http-client.interface.ts
// Abstraction HTTP sortante (testabilité + DIP).
export const HTTP_CLIENT = Symbol('HTTP_CLIENT');

export interface HttpResponse {
  status: number;
}

export interface IHttpClient {
  post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<HttpResponse>;
}
