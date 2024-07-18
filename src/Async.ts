const RETRY_DELAY_IN_MILLISECONDS = 100;
const TIMEOUT_IN_MILLISECONDS = 5000;

export async function retryWithTimeout(asyncFn: () => Promise<boolean>, options = {
  timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS,
  retryDelayInMilliseconds: RETRY_DELAY_IN_MILLISECONDS
}): Promise<void> {
  await runWithTimeout(options.timeoutInMilliseconds, async () => {
    while (true) {
      if (await asyncFn()) {
        console.debug("Retry completed successfully");
        return;
      }

      console.debug(`Retry completed unsuccessfully. Trying again in ${options.retryDelayInMilliseconds} milliseconds`);
      await sleep(options.retryDelayInMilliseconds);
    }
  });
}

async function runWithTimeout<R>(timeoutInMilliseconds: number, asyncFn: () => Promise<R>): Promise<R> {
  return await Promise.race([asyncFn(), timeout()]);

  async function timeout(): Promise<never> {
    await sleep(timeoutInMilliseconds);
    throw new Error(`Timed out in ${timeoutInMilliseconds} milliseconds`);
  }
}

export function convertToSync(promise: Promise<unknown>): void {
  promise.catch(console.error);
}
