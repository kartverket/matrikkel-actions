# slack-approval-notifier

Custom github action to post notification to slack to get approvals to deployments

## Usage

In your application repository:
```yaml
name: Example
on:
  workflow_dispatch:

env:
  CI: true
  TZ: Europe/Oslo
  SLACK_CHANNEL: C09V5AXA4R5
  ENVIRONMENT: production
  APP_VERSION: 1.2.3

defaults:
  run:
    shell: bash

jobs:
  deploy-prod-notifier:
    runs-on: ubuntu-latest
    outputs:
      messageId: ${{ steps.slack_notify.outputs.messageId }}
    steps:
      - name: Notify slack (Setup via OctoSTS)
        id: slack_notify
        uses: kartverket/matrikkel-actions/slack-approval-notifier/setup-octo@feat/slack-notifier-action
        with:
          channel: ${{ env.SLACK_CHANNEL }}
          environment: ${{ env.ENVIRONMENT }}
          appDescriptor: atkv3-prod:matrikkel-nd:matrikkel-app:${{ env.APP_VERSION }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
  deploy-prod:
    runs-on: ubuntu-latest
    needs: deploy-prod-notifier
    environment:
      name: production
    steps:
      - name: Notify slack (Update)
        uses: kartverket/matrikkel-actions/slack-approval-notifier/update@feat/slack-notifier-action
        with:
          channel: ${{ env.SLACK_CHANNEL }}
          environment: ${{ env.ENVIRONMENT }}
          appDescriptor: atkv3-prod:matrikkel-nd:matrikkel-app:${{ env.APP_VERSION }}
          messageId: ${{ needs.deploy-prod-notifier.outputs.messageId }}
          status: ${{ job.status }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
      - name:  Deploy Prod
        shell: bash
        run: |
          sleep 10
          echo " Deploy Prod"
```
