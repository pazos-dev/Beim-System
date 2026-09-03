import { afterEach, vi } from 'vitest';

// react-native cannot be parsed by plain Node. Replace it with a lightweight
// renderable mock so react-test-renderer assertions work in jsdom.
vi.mock(
  'react-native',
  () => import('./src/test/__mocks__/react-native'),
);

afterEach(() => {
  // @testing-library/react-native cleanup is not used; mock host trees need no teardown.
});
