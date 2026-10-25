import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication is required.') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do this.') => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);
export const unprocessable = (message: string, details?: unknown) => new HttpError(422, message, details);

/** Wraps an async route so rejected promises reach the error middleware. */
export function route(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Validates input against a schema and throws a 400 listing the invalid fields. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest('Some fields are missing or invalid.', formatZodError(result.error));
  }
  return result.data;
}

export function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map(issue => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
}

export function errorMiddleware(error: any, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  // Body parser and multer errors carry their own status codes.
  if (error?.type === 'entity.too.large' || error?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'The uploaded content is too large.' });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON.' });
    return;
  }
  // Postgres constraint violations that slipped past validation.
  if (error?.code === '23505') {
    res.status(409).json({ error: 'A record with these details already exists.' });
    return;
  }
  if (error?.code === '23503' || error?.code === '23514') {
    res.status(422).json({ error: 'The request conflicts with existing records or business rules.' });
    return;
  }
  console.error(`[api] ${req.method} ${req.path} failed:`, error);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

export function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || '').slice(0, 64);
}
