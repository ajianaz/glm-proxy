import type { Context, Next } from 'hono';

export function adminAuthMiddleware(): (c: Context, next: Next) => Promise<void | Response> {
  return async (c, next) => {
    const adminKey = c.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKey) {
      return c.json({ message: 'ADMIN_API_KEY not configured' }, 500);
    }

    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ message: 'Invalid admin credentials' }, 401);
    }

    const providedKey = authHeader.replace(/^Bearer\s+/i, '');

    if (providedKey !== adminKey) {
      return c.json({ message: 'Invalid admin credentials' }, 401);
    }

    await next();
  };
}
