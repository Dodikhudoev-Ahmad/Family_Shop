import { request } from 'node:http';

/** A tiny real-network fetch for the opt-in live tests (jest-expo replaces the global fetch with a stub). */
export function nodeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = init.headers as Record<string, string> | undefined;
    const req = request(url, { method: init.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          json: () => (text ? Promise.resolve(JSON.parse(text) as unknown) : Promise.reject(new Error('empty body'))),
        } as unknown as Response);
      });
    });
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  });
}
