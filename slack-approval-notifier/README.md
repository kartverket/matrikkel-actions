# Slack approval notifier Action

Action for å fyre av notifikasjoner til slack for godkjenning av prodsettinger.

## Før bruk
1. Repoet som tar ibruk denne må være lagt til [heimdall-apps som OctoSTS konfigurasjon.](https://github.com/kartverket/heimdall-apps/blob/main/.github/chainguard)
2. Legge til `SLACK_BOT_TOKEN` som secret i repoet


## Bruk

```yaml
jobs:
  # Tidligere steg kan ha deployet til dev, QA, etc.

  deploy-prod-notifier:
    name: "Slack Notify: Deployment to production"
    runs-on: ubuntu-latest
    needs:
      # Trenger mulig avhengigheter her, om man har laget nytt versjonsnummer etc
    permissions:
      actions: read   # To read approvals from action
      contents: read  # To get the changelog from previous version
      id-token: write # To get OctoSTS token for getting current deployed version from apps-repo 
    outputs:
      messageId: ${{ steps.slack_notify.outputs.messageId }}
    steps:
      - name: "Slack Notify: Deployment to production"
        id: slack_notify
        uses: kartverket/matrikkel-actions/slack-approval-notifier/setup-octo@main
        with:
          identity: matrikkel
          channel: C01V1AXA1R1        # Slack channel ID
          environment: "produksjon"   # Miljø som man deployer til
          appDescriptor: atkv3-prod:matrikkel-main:matrikkel-appname:1.2.3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}

  deploy-prod:
    runs-on: ubuntu-latest
    needs:
      - deploy-prod-notifier
    environment:
      name: production # Denne gjør at man kan konfigurere for manuell godkjenning
    steps:
      - name: "Slack Notify: Deployment to production (Update)"
        uses: kartverket/matrikkel-actions/slack-approval-notifier/update@main
        with:
          identity: matrikkel
          channel: C01V1AXA1R1        # Slack channel ID
          environment: "produksjon"   # Miljø som man deployer til
          appDescriptor: atkv3-prod:matrikkel-main:matrikkel-appname:1.2.3
          messageId: ${{ needs.deploy-prod-notifier.outputs.messageId }}
          status: ${{ job.status }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
      
      # Eksempel på hvordan deployen kan være.   
      - name:  Deploy to production
        uses: kartverket/matrikkel-actions/apps-repo-deploy@main
        with:
          identity: matrikkel
          apps: |
            atkv3-prod:matrikkel-main:matrikkel-appname:${{ needs.version.outputs.version }}
      
      # slack-approval-notifier/update har post-script, som vil automatisk kjøre når alt er ferdig og oppdatere meldingen i slack 
```