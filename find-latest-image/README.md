# Find latest GHCR image

Henter siste publiserte Docker‑image‑tag fra GitHub Container Registry (GHCR) for en gitt container‑package.
Filtrerer bort images som **ikke har tags** (såkalte dangling images).

Har brukt matrikkel-proxy som et eksempel under

## Bruk

```yaml
jobs:
  find_latest:
    permissions:
      packages: read     # Required to read GHCR metadata
      contents: read
    runs-on: ubuntu-latest

    steps:
      - uses: kartverket/matrikkel-actions/find-latest-image@main
        id: latest
        with:
          image: matrikkel-proxy   # GHCR package name (se repo → packages)

      - name: Print tag
        run: |
            echo "Latest tag: ${{ steps.latest.outputs.tag }}"
```