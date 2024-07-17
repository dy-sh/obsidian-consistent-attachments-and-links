export function convertToSync(promise: Promise<unknown>): void {
  promise.catch(console.error);
}
