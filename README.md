# GitHub Action: Deployment Notification to Microsoft Teams

This GitHub Action sends a deployment notification to a specified Microsoft Teams channel using an Adaptive Card. It provides details about the deployment status, commit information, and changed files.

## Features

- Sends deployment status notifications to Microsoft Teams.
- Displays commit message, branch, and changed files.
- Provides links to view deployment logs and commit diffs.

## Inputs

- `status: ${{ job.status }}` **Optional** The status of the deployment (e.g., success, failure, or cancelled). Should be sent if `raw_card_body` is used
- `teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}` **Required** The Microsoft Teams webhook URL to send the notification to.
- `last_sha: ${{ github.event.before }}` **Optional** The SHA of the last commit (or send the last successful commit) before the current one. This is used to determine the list of changed files. If not provided, the changed files list will not be included in the notification.
- `raw_card_body` **Optional**
A JSON array that will replace the `body` property of the Adaptive Card. If provided, the default card body is replaced with your custom content. Must be a valid JSON array (not an object). Cannot be used together with the `status` input.
**Example:**
```yaml
with:
  raw_card_body: |
    [
      {
        "type": "TextBlock",
        "size": "medium",
        "weight": "bolder",
        "text": "**Custom Notification**"
      },
      {
        "type": "TextBlock",
        "text": "This is a custom Teams card body."
      }
    ]
  teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}
```
- `raw_card_actions` **Optional**
A JSON array that will replace the `actions` property of the Adaptive Card. If provided, the default actions are replaced with your custom actions. Can be used with either `status` or `raw_card_body`.
**Example:**
```yaml
with:
  raw_card_body: |
    [
      {
        "type": "TextBlock",
        "text": "Hello from custom body!"
      }
    ]
  raw_card_actions: |
    [
      {
        "type": "Action.OpenUrl",
        "title": "Go to GitHub",
        "url": "https://github.com"
      }
    ]
  teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}
```

## Usage Notes
- If both `status` and `raw_card_body` are provided, the action will fail. Use only one.
- If neither `status` nor `raw_card_body` is provided, the action will fail.
- `raw_card_body` must be a valid JSON array (not an object or string).
- `raw_card_actions` must be a valid JSON array.
- If only `raw_card_actions` is provided, it will override the default actions block in the card.

## Example: Only Custom Actions
```yaml
with:
  status: success
  raw_card_actions: |
    [
      {
        "type": "Action.OpenUrl",
        "title": "Open Docs",
        "url": "https://docs.microsoft.com"
      }
    ]
  teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}
```

## Example: Only Custom Body
```yaml
with:
  raw_card_body: |
    [
      {
        "type": "TextBlock",
        "text": "Deployment finished!"
      }
    ]
  teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}
```

## Usage

To use this action, include it in your workflow YAML file:

```yaml
name: Notify Teams on Deployment

on:
  push:
    branches:
      - main

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Send Deployment Notification
        uses: Trimud/ms-teams-notifications@v2
        with:
          status: ${{ job.status }}
          teams_webhook: ${{ secrets.TEAMS_WEBHOOK }}
          last_sha: ${{ github.event.before }}
        if: always()
```
