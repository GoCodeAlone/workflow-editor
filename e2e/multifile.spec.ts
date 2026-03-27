import { test, expect } from '@playwright/test';

// E2E tests for multi-file visual features (file group boundaries + YAML side-pane).
// Run with: npx playwright test e2e/multifile.spec.ts
// Prerequisites: test server at http://localhost:5174 (started by playwright.config.ts webServer)

test.describe('multi-file file group boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=multifile-groups');
    // Wait for React Flow canvas to be present
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    // Allow time for nodes to render and layout
    await page.waitForTimeout(500);
  });

  test('renders file group overlay nodes for each source file', async ({ page }) => {
    // FileGroupNode nodes have data-id starting with __file-group__
    const groupNodes = page.locator('[data-id^="__file-group__"]');
    await expect(groupNodes).toHaveCount(2);
  });

  test('file group nodes have distinct labels matching source files', async ({ page }) => {
    const authGroup = page.locator('[data-id="__file-group__auth.yaml"]');
    const billingGroup = page.locator('[data-id="__file-group__billing.yaml"]');
    // Group nodes are overlay elements (zIndex:-1), so use toBeAttached rather than toBeVisible
    await expect(authGroup).toBeAttached();
    await expect(billingGroup).toBeAttached();
    // Labels should show the filename
    await expect(authGroup.locator('span').first()).toContainText('auth.yaml');
    await expect(billingGroup.locator('span').first()).toContainText('billing.yaml');
  });

  test('file group nodes do not block interaction with canvas nodes', async ({ page }) => {
    // Find the auth-server node (a real workflow node)
    const authNode = page.locator('.react-flow__node').filter({ hasText: 'auth-server' }).first();
    await expect(authNode).toBeVisible();
    // File group overlays use pointer-events:none so the real node should be clickable
    await authNode.click();
    // Node should be selected after click (no error thrown)
  });
});

test.describe('YAML side-pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=yaml-pane');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('renders file tabs for each source file', async ({ page }) => {
    // YamlSidePane renders FileTabBar which has .yaml-tab buttons
    const tabs = page.locator('.yaml-tab');
    // Should have tabs for: main (null), auth.yaml, billing.yaml
    await expect(tabs).toHaveCount(3);
  });

  test('shows "main" tab for the root config file', async ({ page }) => {
    const mainTab = page.locator('.yaml-tab').filter({ hasText: 'main' });
    await expect(mainTab).toBeVisible();
  });

  test('shows a tab for each source file', async ({ page }) => {
    const authTab = page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' });
    const billingTab = page.locator('.yaml-tab').filter({ hasText: 'billing.yaml' });
    await expect(authTab).toBeVisible();
    await expect(billingTab).toBeVisible();
  });

  test('switches active tab when tab is clicked', async ({ page }) => {
    // auth.yaml tab is initially not active
    const authTab = page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' });
    await expect(authTab).not.toHaveClass(/yaml-tab-active/);

    // Click it
    await authTab.click();

    // Now it should be active
    await expect(authTab).toHaveClass(/yaml-tab-active/);
  });

  test('YAML content area is present', async ({ page }) => {
    const lines = page.locator('.yaml-line');
    await expect(lines.first()).toBeVisible();
  });
});

test.describe('node selection highlights YAML in side-pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=yaml-pane');
    await page.waitForSelector('.react-flow__viewport', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  test('clicking a node switches to its source file tab', async ({ page }) => {
    // Click the billing-service node (which belongs to billing.yaml)
    const billingNode = page.locator('.react-flow__node').filter({ hasText: 'billing-service' }).first();
    await expect(billingNode).toBeVisible();
    await billingNode.click();
    await page.waitForTimeout(200);

    // The billing.yaml tab should become active
    const billingTab = page.locator('.yaml-tab').filter({ hasText: 'billing.yaml' });
    await expect(billingTab).toHaveClass(/yaml-tab-active/);
  });

  test('clicking a node creates highlighted lines in YAML pane', async ({ page }) => {
    // Click the auth-server node
    const authNode = page.locator('.react-flow__node').filter({ hasText: 'auth-server' }).first();
    await expect(authNode).toBeVisible();
    await authNode.click();
    await page.waitForTimeout(200);

    // Some lines should be highlighted
    const highlightedLines = page.locator('.yaml-line-highlighted');
    const count = await highlightedLines.count();
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
    // Switch to auth.yaml tab
    const authTab = page.locator('.yaml-tab').filter({ hasText: 'auth.yaml' });
    await authTab.click();
    await page.waitForTimeout(200);

    // Click a line in auth.yaml that belongs to a module definition
    // This should call setSelectedNode → re-render with highlight range
    const nodeLine = page.locator('.yaml-line code').filter({ hasText: 'auth-server' }).first();
    await expect(nodeLine).toBeVisible();
    await nodeLine.click();
    await page.waitForTimeout(300);

    // After clicking, the selection feedback should appear:
    // Either highlighted lines (if same file) or auth.yaml tab stays active
    const authTabActive = page.locator('.yaml-tab-active').filter({ hasText: 'auth.yaml' });
    await expect(authTabActive).toBeVisible();

    // The highlighted lines in the YAML pane should correspond to the selected node
    const highlightedLines = page.locator('.yaml-line-highlighted');
    const highlightCount = await highlightedLines.count();
    expect(highlightCount).toBeGreaterThan(0);
  });
});
