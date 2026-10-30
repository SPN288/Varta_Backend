// Simple in-memory fixed-window rate limiter, keyed by client IP.
// Good enough for a single server instance; use a shared store (e.g. Redis) if you scale out.
const rateLimit = ({ windowMs, max, message }) => {
  const hits = new Map();

  // Periodically drop expired windows so the map doesn't grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
};

module.exports = rateLimit;
