/// <reference types="vite/client" />

import type { SenkuAPI } from '../electron/types';

declare global {
  interface Window {
    senku: SenkuAPI;
  }
}
