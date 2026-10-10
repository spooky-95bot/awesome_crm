// src/modules/integrations/http/fetch-http.client.ts
// Global fetch + AbortController avec timeout (un récepteur lent ne bloque pas le système).
import { Injectable } from '@nestjs/common';
import { HttpResponse, IHttpClient } from './http-client.interface';

@Injectable()
export class FetchHttpClient implements IHttpClient {
  async post(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers,
        signal: controller.signal,
      });
      return { status: res.status };
    } finally {
      clearTimeout(timer);
    }
  }
}
