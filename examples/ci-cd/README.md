# CI/CD Integration

Add CBrowser checks to your existing CI pipeline so every pull request is automatically validated with natural-language E2E tests, visual regression, and performance regression.

## Prerequisites

- **Node.js 20+** installed in your CI runner
- A **staging URL** that reflects the PR branch (set as a CI variable)
- CBrowser baselines captured at least once before the first CI run

## Quick start

1. Copy the workflow file for your platform into your repository:
   - **GitHub Actions** — [`github-actions.yml`](github-actions.yml) goes to `.github/workflows/cbrowser.yml`
   - **GitLab CI** — [`gitlab-ci.yml`](gitlab-ci.yml) merges into your `.gitlab-ci.yml`

2. Set the staging URL variable:
   - GitHub: **Settings > Variables > Actions** — add `STAGING_URL`
   - GitLab: **Settings > CI/CD > Variables** — add `STAGING_URL`

3. Capture initial baselines (one-time, run locally or in a setup job):

```bash
npx cbrowser visual-regression $STAGING_URL --save-baseline production
npx cbrowser perf-regression $STAGING_URL --save-baseline production-perf
```

4. Open a pull request — the pipeline runs automatically.

## Tips

- **Refresh baselines after every production deploy.** Add a post-deploy job that runs the `--save-baseline` commands above so your comparisons always target the latest production state.
- **Keep test suites in version control.** Store `tests/e2e-suite.txt` alongside your source code so test changes are reviewed in the same PR.
- **Start with `--sensitivity normal`** for performance checks and tighten to `strict` once your metrics stabilize.
