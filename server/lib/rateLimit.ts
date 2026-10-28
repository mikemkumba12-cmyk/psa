import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';

/**
 * Fixed-window, in-memory rate limiter keyed by client IP and route.
 * Suitable for a single API instance; a shared store (e.g. Redis or Postgres)
 * is needed if the API is ever scaled horizontally.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(name: string, maxPerWindow: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (config.isTest && req.header('X-Test-Rate-Limit') !== 'on') return next();
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxPerWindow) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}, 60_000).unref();
