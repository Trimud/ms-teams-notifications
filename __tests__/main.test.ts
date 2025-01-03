/**
 * Unit tests for the action's main functionality, src/main.ts
 */

import * as main from '../src/main'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

jest.mock('@actions/core')
jest.mock('@actions/exec')
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'mock-owner', repo: 'mock-repo' },
    ref: 'refs/heads/main',
    actor: 'mock-actor',
    sha: 'mock-sha',
    runId: 1234
  }
}))

// Mock GitHub Actions core library functions
let debugMock: jest.SpiedFunction<typeof core.debug>
let errorMock: jest.SpiedFunction<typeof core.error>
let getInputMock: jest.SpiedFunction<typeof core.getInput>
let setFailedMock: jest.SpiedFunction<typeof core.setFailed>
let setOutputMock: jest.SpiedFunction<typeof core.setOutput>

describe('action', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    debugMock = jest.spyOn(core, 'debug').mockImplementation()
    errorMock = jest.spyOn(core, 'error').mockImplementation()
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()
  })

  it('sends an adaptive card to Microsoft Teams successfully', async () => {
    // Mock inputs
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      return ''
    })

    // Mock exec calls
    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff-tree')) {
          options?.listeners?.stdout?.(Buffer.from('file1.txt\nfile2.js\n'))
        }
        return 0
      })

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    // Run the action
    await main.run()

    // Assertions
    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      ['log', '-1', '--pretty=%B'],
      expect.anything()
    )
    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
      expect.anything()
    )
    expect(global.fetch).toHaveBeenCalledWith(
      'https://mock-teams-webhook-url',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Deployment Successful')
      })
    )
    expect(setFailedMock).not.toHaveBeenCalled()
  })

  it('handles different statuses correctly', async () => {
    const statuses = ['success', 'failure', 'warning']

    for (const status of statuses) {
      getInputMock.mockImplementation(name => {
        if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
        if (name === 'status') return status
        return ''
      })

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      })

      await main.run()

      const expectedText =
        status === 'success'
          ? 'Deployment Successful'
          : status === 'failure'
            ? 'Deployment Failed'
            : 'Deployment Warning'

      expect(global.fetch).toHaveBeenCalledWith(
        'https://mock-teams-webhook-url',
        expect.objectContaining({
          body: expect.stringContaining(expectedText)
        })
      )
    }
  })

  it('logs the adaptive card payload for debugging', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff-tree')) {
          options?.listeners?.stdout?.(Buffer.from('file1.txt\nfile2.js\n'))
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    await main.run()

    expect(debugMock).toHaveBeenCalledWith(
      expect.stringContaining('"type": "message"')
    )
    expect(debugMock).toHaveBeenCalledWith(
      expect.stringContaining('"attachments"')
    )
    expect(debugMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '"contentType": "application/vnd.microsoft.card.adaptive"'
      )
    )
  })

  it('handles cases where no files were changed with success status', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff-tree')) {
          options?.listeners?.stdout?.(Buffer.from('')) // No changed files
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    await main.run()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mock-teams-webhook-url',
      expect.objectContaining({
        body: expect.stringContaining('No files changed.')
      })
    )
  })

  it('handles non-200 fetch responses gracefully', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff-tree')) {
          options?.listeners?.stdout?.(Buffer.from('file1.txt\nfile2.js\n'))
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('Internal Server Error')
    })

    await main.run()

    expect(setFailedMock).toHaveBeenCalledWith(
      'Failed to send notification. HTTP 500: Internal Server Error'
    )
  })
})
