import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React 19 + @testing-library/react@16 require React.act to be enabled in
// the test environment; without it component tests emit "not wrapped in
// act(...)" warnings that can trip strict CI configurations.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
})
