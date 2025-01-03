import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'

export async function run(): Promise<void> {
  try {
    // Input from workflow
    const status =
      core.getInput('status', { required: true }).toLowerCase() || 'success'
    const teamsWebhook = core.getInput('teams_webhook', { required: true })

    // Retrieve repository and branch information from GitHub context
    const { owner, repo } = github.context.repo
    const repository = `${owner}/${repo}`
    const ref = github.context.ref // e.g., refs/heads/main
    const branch = ref.replace('refs/heads/', '')

    // Retrieve actor and commit SHA from GitHub context
    const { actor, sha: commitSha } = github.context
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

    // Construct different cards based on the status
    let cardTitle = '**Deployment Successful**'
    let cardIcon = '✅'
    let cardDetails = 'The deployment completed successfully.'

    if (status === 'failure') {
      cardTitle = '**Deployment Failed**'
      cardIcon = '❌'
      cardDetails =
        'The deployment encountered errors. Please check the logs for details.'
    } else if (status === 'warning') {
      cardTitle = '**Deployment Warning**'
      cardIcon = '⚠️'
      cardDetails =
        'The deployment completed with warnings. Review the logs for more information.'
    }

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
                        text: cardIcon,
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
                        text: cardTitle,
                        wrap: true
                      },
                      {
                        type: 'TextBlock',
                        spacing: 'none',
                        text: cardDetails,
                        isSubtle: true,
                        wrap: true
                      },
                      {
                        type: 'TextBlock',
                        spacing: 'none',
                        text: `Ran by [${actor}](https://github.com/${actor})`,
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
                title: 'View Deployment Logs',
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
