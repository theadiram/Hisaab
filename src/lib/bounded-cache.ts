/** A bounded LRU for reusable public data; failed loads are never retained. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; bytes: number; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(
    private maxBytes: number,
    private maxEntries: number,
    private ttlMs: number,
    private size: (value: T) => number,
  ) {}
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.bytes -= hit.bytes;
      if (hit.expires > Date.now()) {
        this.entries.set(key, hit);
        this.bytes += hit.bytes;
        return hit.value;
      }
    }
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = load()
      .then((value) => {
        const bytes = this.size(value);
        if (bytes <= this.maxBytes) {
          while (
            this.entries.size &&
            (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)
          ) {
            const first = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(first)!.bytes;
            this.entries.delete(first);
          }
          this.entries.set(key, { value, bytes, expires: Date.now() + this.ttlMs });
          this.bytes += bytes;
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    if (this.pending.size < this.maxEntries) this.pending.set(key, promise);
    return promise;
  }
}
