/**
 * FIFO serial execution queue to avoid concurrent requests colliding
 * on Google Spreadsheet updates.
 */
class AsyncQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (err) {
        console.error('Queue task execution failed:', err);
      }
    }
    this.processing = false;
    this.processNext();
  }
}

export const googleApiQueue = new AsyncQueue();

/**
 * Executes a function with exponential backoff.
 * Max 4 attempts, base delay 1.5 seconds, doubles each attempt.
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 4,
  baseDelayMs: number = 1500
): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) {
        console.error(`Failed after ${attempt} attempts.`);
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms... Error:`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

/**
 * Combined utility to queue a task and run it with backoff retry safely.
 */
export function queueGoogleApiCall<T>(fn: () => Promise<T>): Promise<T> {
  return googleApiQueue.enqueue(() => withExponentialBackoff(fn));
}
