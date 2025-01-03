# GitHub Action: Deployment Notification to Microsoft Teams

This GitHub Action sends a deployment notification to a specified Microsoft Teams channel using an Adaptive Card. It provides details about the deployment status, commit information, and changed files.

## Features

- Sends deployment status notifications to Microsoft Teams.
- Displays commit message, branch, and changed files.
- Provides links to view deployment logs and commit diffs.

## Inputs

- `status: ${{job.status}}` **Required** The status of the deployment (e.g., success, failure or cancelled).
- `teams_webhook: ${{ secrets.MSTEAMS_WEBHOOK }}` **Required** The Microsoft Teams webhook URL to send the notification to.

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
        uses: Trimud/ms-teams-notifications@v1
        with:
          status: ${{ job.status }}
          teams_webhook: ${{ secrets.TEAMS_WEBHOOK }}
        if: always()
```