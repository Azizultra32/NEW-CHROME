import { beforeEach } from 'vitest';

beforeEach(() => {
  Object.assign(globalThis.navigator, {
    clipboard: {
      writeText: async () => {}
    }
  });
});
