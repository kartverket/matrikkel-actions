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
    name: Slack notification (Setup)
    runs-on: ubuntu-latest
    outputs:
      messageId: ${{ steps.slack_notify.outputs.messageId }}
    steps:
      - name: Notify slack (Setup)
        id: slack_notify
        uses: kartverket/matrikkel-actions/slack-approval-notifier/setup@feat/slack-notifier-action
        with:
          channel: ${{ env.SLACK_CHANNEL }}
          environment: ${{ env.ENVIRONMENT }}
          version: ${{ env.APP_VERSION }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
  deploy-prod:
    name: Deploy Prod
    runs-on: ubuntu-latest
    needs: deploy-prod-notifier
    environment:
      name: production # guard which requires approval
    steps:
      - name: Notify slack (Update)
        # This "update" action has a post-step reporting the final state of your action
        uses: kartverket/matrikkel-actions/slack-approval-notifier/update@feat/slack-notifier-action
        with:
          channel: ${{ env.SLACK_CHANNEL }}
          environment: ${{ env.ENVIRONMENT }}
          version: ${{ env.APP_VERSION }}
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