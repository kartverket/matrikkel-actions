# Matrikkel actions

Dette repoet inneholder gjenbrukbare actions som brukes av bl.a. matrikkelen.

## Actions

### create-pr

Lager er branch, pusher, og oppretter en PR. Kan automatisk merge en PR, men dette krever at repoet den brukes i støtter auto-merge.

Bruk:

```yaml

jobs:
  create_pr:
    permissions:
      id-token: write       # Required for getting the GitHub token
      contents: write       # Required to create branches and merge PRs
      pull-requests: write  # Required to create PRs
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
      - name: "Example: Update replicas"
        run: |
          # Example of code update
          echo '${{ inputs.replicas }}' > src/replicas
          git add src/replicas
          # The create-pr action will commit the changes
      - uses: kartverket/matrikkel-actions/create-pr@main
        with:
          github_token: ${{ github.token }}
          commit_message: "Scale replicas to ${{ inputs.replicas }}" # Message will be prefixed with '[action] '
          branch_name_prefix: "action/update-replicas" # Date and time will be included in the branch name to avoid duplicates
          automerge: true # Optional, defaults to true
```
