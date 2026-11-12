interface Bucket {
  tokens: number;
  at: number;
}

const MAX_KEYS = 50_000;

/** A token bucket per key: `burst` at once, refilled at `perMinute`. Keys are forgotten once full again. */
export class RateLimit {
  private buckets = new Map<string, Bucket>();

  constructor(private o: { burst: number; perMinute: number; now: () => number }) {}

  /** Takes one token for `key`; false when there is none left. */
  take(key: string) {
    const now = this.o.now();
    const b = this.buckets.get(key) ?? { tokens: this.o.burst, at: now };
    const refill = ((now - b.at) / 60_000) * this.o.perMinute;
    b.tokens = Math.min(this.o.burst, b.tokens + refill);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > MAX_KEYS) this.forgetFull(now);
    return true;
  }

  private forgetFull(now: number) {
    for (const [key, b] of this.buckets) {
      const full = b.tokens + ((now - b.at) / 60_000) * this.o.perMinute >= this.o.burst;
      if (full) this.buckets.delete(key);
    }
  }
}
