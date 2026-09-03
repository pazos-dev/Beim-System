import type { BeimBridge } from '../shared/ipc';

declare global {
  interface Window {
    beim: BeimBridge;
  }
}
