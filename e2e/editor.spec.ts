import { test, expect } from '@playwright/test';

// E2E tests for the workflow editor.
// Run with: npx playwright test
// The playwright.config.ts webServer starts the test harness on http://localhost:5174

test.describe('Workflow Editor E2E', () => {
  test('editor loads and renders canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    expect(page.url()).toContain('localhost');
  });

  test('loads YAML and renders nodes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    // TODO: Load a sample workflow config via UI or API
    expect(true).toBe(true); // placeholder
  });

  test('add node from palette updates canvas', async ({ page }) => {
    await page.goto('/');
    // TODO: Open node palette, double-click an item to add a node
    expect(true).toBe(true); // placeholder
  });

  test('editing node config updates YAML', async ({ page }) => {
    await page.goto('/');
    // TODO: Select a node, edit a config field in property panel
    expect(true).toBe(true); // placeholder
  });
});

// ---------------------------------------------------------------------------
// Multi-file visual features: file group boundaries + YAML side-pane
// These tests use the test harness app served by the playwright webServer.
// ---------------------------------------------------------------------------

test.describe('multi-file file group boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=multifile-groups');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('renders file group overlay nodes for each source file', async ({ page }) => {
    const groupNodes = page.locator('[data-id^="__file-group__"]');
    await expect(groupNodes).toHaveCount(2);
  });

  test('file group nodes have distinct labels matching source files', async ({ page }) => {
    const authGroup = page.locator('[data-id="__file-group__auth.yaml"]');
    const billingGroup = page.locator('[data-id="__file-group__billing.yaml"]');
    // Group nodes are overlay elements (zIndex:-1), use toBeAttached rather than toBeVisible
    await expect(authGroup).toBeAttached();
    await expect(billingGroup).toBeAttached();
    await expect(authGroup.locator('span').first()).toContainText('auth.yaml');
    await expect(billingGroup.locator('span').first()).toContainText('billing.yaml');
  });

  test('file group nodes do not block interaction with canvas nodes', async ({ page }) => {
    const authNode = page.locator('.react-flow__node').filter({ hasText: 'auth-server' }).first();
    await expect(authNode).toBeVisible();
    // File group overlays use pointer-events:none so the real node should be clickable
    await authNode.click();
  });
});

test.describe('YAML side-pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=yaml-pane');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('renders file tabs for each source file', async ({ page }) => {
    const tabs = page.locator('.yaml-tab');
    // Tabs for: main (null), auth.yaml, billing.yaml
    await expect(tabs).toHaveCount(3);
  });

  test('shows "main" tab for the root config file', async ({ page }) => {
    const mainTab = page.locator('.yaml-tab').filter({ hasText: 'main' });
    await expect(mainTab).toBeVisible();
  });

  test('shows a tab for each source file', async ({ page }) => {
    await expect(page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' })).toBeVisible();
    await expect(page.locator('.yaml-tab').filter({ hasText: 'billing.yaml' })).toBeVisible();
  });

  test('switches active tab when tab is clicked', async ({ page }) => {
    const authTab = page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' });
    await expect(authTab).not.toHaveClass(/yaml-tab-active/);
    await authTab.click();
    await expect(authTab).toHaveClass(/yaml-tab-active/);
  });

  test('YAML content area is present', async ({ page }) => {
    await expect(page.locator('.yaml-line').first()).toBeVisible();
  });
});

test.describe('node selection highlights YAML in side-pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=yaml-pane');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('clicking a node switches to its source file tab', async ({ page }) => {
    const billingNode = page.locator('.react-flow__node').filter({ hasText: 'billing-service' }).first();
    await expect(billingNode).toBeVisible();
    await billingNode.click();
    await page.waitForTimeout(200);
    const billingTab = page.locator('.yaml-tab').filter({ hasText: 'billing.yaml' });
    await expect(billingTab).toHaveClass(/yaml-tab-active/);
  });

  test('clicking a node creates highlighted lines in YAML pane', async ({ page }) => {
    const authNode = page.locator('.react-flow__node').filter({ hasText: 'auth-server' }).first();
    await expect(authNode).toBeVisible();
    await authNode.click();
    await page.waitForTimeout(200);
    const count = await page.locator('.yaml-line-highlighted').count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('YAML line click selects canvas node', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=yaml-pane');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('clicking a YAML line activates corresponding node selection (highlights YAML range)', async ({ page }) => {
    const authTab = page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' });
    await authTab.click();
    await page.waitForTimeout(200);

    const nodeLine = page.locator('.yaml-line code').filter({ hasText: 'auth-server' }).first();
    await expect(nodeLine).toBeVisible();
    await nodeLine.click();
    await page.waitForTimeout(300);

    await expect(page.locator('.yaml-tab-active').filter({ hasText: 'auth.yaml' })).toBeVisible();
    const highlightCount = await page.locator('.yaml-line-highlighted').count();
    expect(highlightCount).toBeGreaterThan(0);
  });
});
