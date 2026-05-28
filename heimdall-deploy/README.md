# Heimdall Deploy

`heimdall-deploy` is Heimdall's wrapper around [`skip-deploy`](../skip-deploy). It deploys rendered Skip resources to `kartverket/heimdall-apps` and supplies Heimdall's GCP project, workload identity provider, and service account based on the selected cluster.

Application repositories owned by Heimdall should use this action instead of calling `skip-deploy` directly.

## Usage

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: kartverket/matrikkel-actions/heimdall-deploy@main
        with:
          cluster: atkv3-dev-user-cluster
          resource: .skip/dev/app.yaml,.skip/dev/db.yaml
          timeout: 10m
          wait: "true"
          var: |
            namespace=main,image=repo/app:123,date=2026-05-22
            namespace=readonly,image=repo/app:123,date=2026-05-22
```

The OctoSTS identity is the caller repository name: `${{ github.event.repository.name }}`. Before using this action, that repository must be configured as an allowed identity in `kartverket/heimdall-apps`.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `cluster` | yes | | Heimdall Kubernetes cluster to deploy to. Supported values are currently `atkv3-dev-user-cluster` and `atkv3-prod-user-cluster`. |
| `resource` | yes | | Comma-separated resource files from the caller repository checkout. |
| `var` | no | | Newline-separated variable rows. Each row is comma-separated `key=value` pairs. |
| `dry_run` | no | `false` | Render and validate input without writing, committing, pushing, or waiting. |
| `print_payload` | no | `false` | Print rendered resources to the workflow log. |
| `wait` | no | `true` | Wait until Kubernetes reports the rendered deployment versions ready or failed. |
| `timeout` | no | `10m` | Wait timeout. Supported suffixes are `ms`, `s`, `m`, and `h`. |

## Resource Format

Each rendered resource must include:

- `metadata.namespace`
- `metadata.name`
- `spec.image` (must include version)

The action writes the rendered resource to:

```text
env/<cluster>/<namespace>/<name>.yaml
```

in `kartverket/heimdall-apps`.

## Templating

Resource files may contain `{{ variable }}` placeholders. Every row in `var` renders every resource once:

```yaml
var: |
  namespace=main,image=repo/app:123,date=2026-05-22
  namespace=readonly,image=repo/app:123,date=2026-05-22
```

If `var` is omitted, resources are processed once without variables. This is useful for fully rendered resources. Resources that still contain `{{ ... }}` placeholders will fail unless the matching variables are provided.

## Cluster Defaults

`heimdall-deploy` maps the `cluster` input to Heimdall's deployment infrastructure:

| Cluster | GCP project | Service account |
| --- | --- | --- |
| `atkv3-dev-user-cluster` | `kubernetes-dev-94b9` | `matrikkel-deploy@matrikkel-dev-fd36.iam.gserviceaccount.com` |
| `atkv3-prod-user-cluster` | `kubernetes-prod-e4a2` | `matrikkel-deploy@matrikkel-prod-91b2.iam.gserviceaccount.com` |

Any cluster value other than the dev cluster currently uses the production settings.

## Prerequisites

- The workflow must grant `id-token: write`.
- The caller repository name must be configured as an OctoSTS identity in `kartverket/heimdall-apps`.
- The rendered namespaces and applications must be readable by Heimdall's deploy service account when `wait` is enabled.
