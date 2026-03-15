import { test, expect } from '@playwright/test'

test('baseline - playwright is configured', async ({ page: _page }) => {
  // This test is a configuration smoke test only.
  // It does not require a running server.
  expect(true).toBe(true)
})
