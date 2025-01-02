import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'

export async function run(): Promise<void> {
  try {
    // Input from workflow
    const teamsWebhook = core.getInput('teams_webhook', { required: true })

    // Retrieve repository and branch information from GitHub context
    const { owner, repo } = github.context.repo
    const repository = `${owner}/${repo}`
    const ref = github.context.ref // e.g., refs/heads/main
    const branch = ref.replace('refs/heads/', '')

    // Retrieve actor and commit SHA from GitHub context
    const actor = github.context.actor
    const commitSha = github.context.sha
    const workflowUrl = `https://github.com/${repository}/actions/runs/${github.context.runId}`
    const commitDiffUrl = `https://github.com/${repository}/commit/${commitSha}`

    // Fetch the latest commit message
    let commitMessage = ''
    await exec.exec('git', ['log', '-1', '--pretty=%B'], {
      listeners: {
        stdout: (data: Buffer) => {
          commitMessage += data.toString()
        }
      }
    })
    commitMessage = commitMessage.trim()

    // Get the list of changed files
    let changedFilesOutput = ''
    await exec.exec(
      'git',
      ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
      {
        listeners: {
          stdout: (data: Buffer) => {
            changedFilesOutput += data.toString()
          }
        }
      }
    )

    const changedFiles = changedFilesOutput
      .split('\n')
      .filter(file => file)
      .map(
        file =>
          `* [${file}](https://github.com/${repository}/blob/${branch}/${file})`
      )
      .join('\n')

    // Get the current date and time
    const datetime = new Date().toISOString()

    // Construct the Adaptive Card JSON
    const adaptiveCard = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.5',
            msteams: {
              width: 'Full'
            },
            body: [
              {
                type: 'TextBlock',
                size: 'medium',
                weight: 'bolder',
                text: `**Deployment Notification** on [${repository}](https://github.com/${repository})`
              },
              {
                type: 'ColumnSet',
                columns: [
                  {
                    type: 'Column',
                    items: [
                      {
                        type: 'TextBlock',
                        weight: 'bolder',
                        text: '✅',
                        wrap: true,
                        size: 'extraLarge'
                      }
                    ],
                    width: 'auto'
                  },
                  {
                    type: 'Column',
                    items: [
                      {
                        type: 'TextBlock',
                        weight: 'bolder',
                        text: 'Successful Deployment',
                        wrap: true
                      },
                      {
                        type: 'TextBlock',
                        spacing: 'none',
                        text: `by [${actor}](https://github.com/${actor}) on ${datetime}`,
                        isSubtle: true,
                        wrap: true
                      }
                    ],
                    width: 'stretch'
                  }
                ]
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Commit message:', value: commitMessage },
                  {
                    title: 'Repository & branch:',
                    value: `[${branch}](https://github.com/${repository}/tree/${branch})`
                  },
                  {
                    title: 'Files changed:',
                    value: changedFiles || 'No files changed.'
                  }
                ]
              }
            ],
            actions: [
              {
                id: 'viewStatus',
                type: 'Action.OpenUrl',
                title: 'View build/deploy status',
                url: workflowUrl
              },
              {
                id: 'reviewDiffs',
                type: 'Action.OpenUrl',
                title: 'View commit diffs',
                url: commitDiffUrl
              }
            ]
          }
        }
      ]
    }

    // Send the Adaptive Card to Microsoft Teams
    const response = await fetch(teamsWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(adaptiveCard)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Failed to send notification. HTTP ${response.status}: ${errorText}`
      )
    }

    core.info('Notification sent to Microsoft Teams successfully.')
  } catch (error: any) {
    core.setFailed(`${error.message}`)
  }
}
