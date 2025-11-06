# apps-repo-deploy

Custom github action to update application versions in [Heimdalls Apps Repo](https://github.com/kartverket/heimdall-apps).

## Usage

Must have OctoSTS configured against heimdall-apps.

In your application repository:
```yaml
on:
  push:
    - 'main'

concurrency:
  group: heimdall-apps-deploy
  cancel-in-progress: false

jobs:
  deploy-to-all:
    name: Deploy til alle miljøer
    runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: kartverket/matrikkel-actions/apps-repo-deploy/action.yml@main
      with:
        apps: |
          atkv3-dev:matrikkel-main:matrikkel-status:1.2.3
          atkv3-prod:matrikkel-nd:matrikkel-status:4.2.3
          atkv3-prod:matrikkel-nd:matrikkel-innsyn:4.2.3
```