# Skip Deploy

`skip-deploy` renders one or more Skip/Kubernetes resource files, writes the rendered resources to an ArgoCD apps repo, pushes the change, and optionally waits for Kubernetes to report the deployed version as ready.

This is the low-level deploy action. The recommended setup is to create a team-specific wrapper action, similar to [`heimdall-deploy`](../heimdall-deploy), that supplies your apps repo, OctoSTS identity convention, GCP project, workload identity provider, and service account. Application repositories should normally call that wrapper instead of calling `skip-deploy` directly.

## How It Works

1. Checks out the caller repository so resource files can be read from the workflow workspace.
2. Checks out `apps_repo` into `apps-repo/` with an OctoSTS token.
3. Renders each resource file once per `var` row, or once with no variables when `var` is omitted.
4. Writes each rendered resource to `env/<cluster>/<namespace>/<name>.yaml` in the apps repo.
5. Commits and pushes changes to the apps repo unless `dry_run` is `true`.
6. If `wait` is `true`, authenticates to Kubernetes and waits for the rendered app descriptors to become ready.

The rendered resource must contain:

- `metadata.namespace`
- `metadata.name`
- `spec.image` (must include version)

Those fields determine the apps-repo target path and the deployment that `wait` monitors.

## Recommended Wrapper

Create a wrapper action in this repository or in your own actions repository. The wrapper should expose only the values application teams need to choose, and hard-code team-owned infrastructure settings.

```yaml
name: My Team Deploy
description: Deploy a Skip application through my team's apps repo

inputs:
  cluster:
    description: Kubernetes cluster to deploy to
    required: true
  resource:
    description: Comma-separated resource files from the caller repository
    required: true
  var:
    description: Newline-separated variable rows, each row using comma-separated key=value pairs
    required: false
  wait:
    description: Wait for the deployment to become ready
    required: false
    default: "true"

runs:
  using: composite
  steps:
    - uses: kartverket/matrikkel-actions/skip-deploy@main
      with:
        apps_repo: kartverket/my-team-apps
        apps_repo_default_branch: main
        identity: ${{ github.event.repository.name }}
        kubernetes_project_id: my-kubernetes-project
        workload_identity_provider: projects/123/locations/global/workloadIdentityPools/my-pool/providers/github-provider
        service_account: my-deploy@my-project.iam.gserviceaccount.com
        cluster: ${{ inputs.cluster }}
        resource: ${{ inputs.resource }}
        var: ${{ inputs.var }}
        wait: ${{ inputs.wait }}
```

The repository using the wrapper still needs `id-token: write`, because OctoSTS uses GitHub OIDC. Google workload identity is only used when `wait` is `true`.

## Direct Usage

Use `skip-deploy` directly only when you need full control over the apps repo and Kubernetes authentication inputs.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: kartverket/matrikkel-actions/skip-deploy@main
        with:
          apps_repo: kartverket/heimdall-apps
          apps_repo_default_branch: main
          identity: matrikkel
          kubernetes_project_id: kubernetes-dev-94b9
          workload_identity_provider: projects/422604778482/locations/global/workloadIdentityPools/matrikkel-deploy-pool/providers/github-provider
          service_account: matrikkel-deploy@matrikkel-dev-fd36.iam.gserviceaccount.com
          cluster: atkv3-dev-user-cluster
          resource: .skip/dev/app.yaml,.skip/dev/db.yaml
          timeout: 10m
          wait: "true"
          var: |
            namespace=main,image=repo/app:123,date=2026-05-22
            namespace=readonly,image=repo/app:123,date=2026-05-22
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `apps_repo` | yes | | Apps repo to update, for example `kartverket/heimdall-apps`. |
| `apps_repo_default_branch` | no | `main` | Branch to update in the apps repo. |
| `identity` | yes | | OctoSTS identity used to get a token for `apps_repo`. |
| `kubernetes_project_id` | only when `wait` is `true` | | GCP project containing the Kubernetes fleet membership. |
| `workload_identity_provider` | only when `wait` is `true` | | Google workload identity provider used for Kubernetes authentication. |
| `service_account` | only when `wait` is `true` | | Service account used for Kubernetes authentication. |
| `cluster` | yes | | Kubernetes fleet membership/cluster name and apps-repo environment directory. |
| `resource` | yes | | Comma-separated resource files. Paths are relative to the caller repository checkout. |
| `var` | no | | Newline-separated variable rows. Each row is comma-separated `key=value` pairs. |
| `dry_run` | no | `false` | Render and validate input without writing, committing, pushing, or waiting. |
| `print_payload` | no | `false` | Print rendered resource files to the workflow log. |
| `wait` | no | `true` | Wait until Kubernetes reports the rendered deployment versions ready or failed. |
| `timeout` | no | `10m` | Wait timeout. Supported suffixes are `ms`, `s`, `m`, and `h`. |

## Templating

Resource files can contain `{{ variable }}` placeholders. Each row in `var` renders all resources once:

```yaml
var: |
  namespace=main,image=repo/app:123,date=2026-05-22
  namespace=readonly,image=repo/app:123,date=2026-05-22
```

Given this resource:

```yaml
apiVersion: skiperator.kartverket.no/v1alpha1
kind: Application
metadata:
  namespace: "{{ namespace }}"
  name: my-app
spec:
  image: "ghcr.io/appnavn:<version>"
```

The action writes:

```text
env/<cluster>/<namespace>/my-app.yaml
```

If `var` is omitted, each resource is processed once without interpolation variables. Any remaining `{{ ... }}` placeholder then fails the action.

## Manifest Expansion

After templating, `skip-deploy` expands a small set of convenience fields into regular Skiperator and Kubernetes resources before writing to the apps repo.

### GSM environment secrets

Use `gsmSecretName` on `spec.env` entries to fetch values from Google Secret Manager through External Secrets:

```yaml
spec:
  env:
    - name: DB_ADMIN_PASSWORD
      gsmSecretName: prod-matrikkel-db-admin-password
```

The expanded apps-repo file contains one generated `ExternalSecret` for the application, named `<app>-externalsecrets`, targeting `<app>-secrets`. The application gets `envFrom: [{ secret: <app>-secrets }]`, and the shortcut `env` entry is removed from the final Application manifest.

### Database outbound policies

Database host, IP, and JDBC URL must not be committed in application source repositories. Declare the database by name and choose the environment variable that should receive the JDBC URL:

```yaml
spec:
  databases:
    - name: primary
      envName: DATABASE_URL
```

`skip-deploy` resolves the database from the namespace-scoped apps-repo metadata file:

```text
env/<cluster>/<namespace>/database-metadata.yaml
```

The file must use this format:

```yaml
databases:
  - name: primary
    url: jdbc:postgresql://database-host:5432/database-name
    host: database-host
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
```

The resolved `url` is added to `spec.env` using `envName`, and `host`, `ip`, and `ports` are merged into `spec.accessPolicy.outbound.external` in the apps repo output. Resolved URL, host, and IP values are redacted from `print_payload` logs.

## Prerequisites

- The caller workflow must grant `id-token: write`.
- The caller repository must be allowed by the OctoSTS configuration for the selected `identity`.
- The apps repo must contain the target `env/<cluster>/<namespace>/` directories. The action can create or update resource files inside those directories.
- Applications that use `spec.databases` must have `env/<cluster>/<namespace>/database-metadata.yaml` in the apps repo.
- For `wait: "true"`, the service account must be allowed to authenticate to the cluster and read deployments, replicasets, statefulsets, and pods in the rendered namespaces.
