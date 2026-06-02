# Apps repo deploy Action

Custom github action to update application versions in [Heimdalls Apps Repo](https://github.com/kartverket/heimdall-apps).

## Før bruk
Repoet som tar ibruk denne må være lagt til [heimdall-apps som OctoSTS konfigurasjon.](https://github.com/kartverket/heimdall-apps/blob/main/.github/chainguard)

## Bruk

```yaml
jobs:
  deploy-to-all:
    name: Deploy til alle miljøer
    runs-on: ubuntu-latest
    permissions:
      id-token: write # To get OctoSTS token for updating apps-repo
  steps:
    - uses: actions/checkout@v4
    - uses: kartverket/matrikkel-actions/apps-repo-deploy/action.yml@main
      with:
        identity: matrikkel
        apps: |
          atkv3-dev:matrikkel-main:matrikkel-status:1.2.3
          atkv3-prod:matrikkel-nd:matrikkel-status:4.2.3
          atkv3-prod:matrikkel-nd:matrikkel-innsyn:4.2.3
```