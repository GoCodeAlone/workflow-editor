# Contributing to workflow-editor

This project is part of the [GoCodeAlone/workflow](https://github.com/GoCodeAlone/workflow) ecosystem.

## Before contributing

Read the [upstream CONTRIBUTING.md](https://github.com/GoCodeAlone/workflow/blob/main/CONTRIBUTING.md) for general conventions, signing, and review expectations.

## Local development

```sh
git clone https://github.com/GoCodeAlone/workflow-editor.git
cd workflow-editor
npm install
npm run dev
npm test
```

## Pull requests

- One feature or bugfix per PR.
- Update CHANGELOG.md with a Keep-a-Changelog entry.
- Add vitest tests for new components or store logic.
- Add Playwright E2E tests where appropriate.

## Reporting issues

See the issue templates under `.github/ISSUE_TEMPLATE/`.
