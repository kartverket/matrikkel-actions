# Skip Deploy

Custom github action to update application versions in [Heimdalls Apps Repo](https://github.com/kartverket/heimdall-apps).

## Før bruk
Repoet som tar ibruk denne må være lagt til [heimdall-apps som OctoSTS konfigurasjon.](https://github.com/kartverket/heimdall-apps/blob/main/.github/chainguard/heimdall.sts.yaml)

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
    - uses: kartverket/matrikkel-actions/skip-deploy/action.yml@main
      with:
        # package these into your own action
        apps_repo: kartverket/heimdall-apps
        identity: matrikkel-status
        kubernetes_project_id: kube-app-gcp
        service_account: matrikkel-deploy@gcp.com
        workload_identity_provider: projects/367207507054/locations/global/workloadIdentityPools
        
        cluster: atkv3-dev
        dry_run: false
        print_payload: false
        resource: .skip/dev/app.yaml,.skip/dev/db.yaml
        timeout: 10m
        wait: true
        var: |
          namespace=main,image=abba:123,date=21.05.2026
          namespace=nd,image=abba:123,date=21.05.2026
          namespace=readonly,image=abba:123,date=21.05.2026
```