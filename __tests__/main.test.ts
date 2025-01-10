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
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      if (name === 'last_sha') return 'mock-sha'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff')) {
          options?.listeners?.stdout?.(
            Buffer.from(
              'file1.txt\nfile2.js\nfile3.ts\nfile4.md\nfile5.json\nfile6.xml\nfile7.html\nfile8.css\nfile9.scss\nfile10.vue\nfile11.py\n'
            )
          )
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    await main.run()

    // Ensure the git log command was called
    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      ['log', '-1', '--pretty=%B'],
      expect.anything()
    )

    // Ensure the git diff command was called
    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'mock-sha', 'mock-sha'],
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

  it('throws an error for invalid job status', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'invalid' // Invalid status to trigger error
      return ''
    })

    await main.run()

    // Verify that setFailed is called with the error message
    expect(setFailedMock).toHaveBeenCalledWith('Invalid job status: invalid')
  })

  it('handles cases where last_sha is not provided', async () => {
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
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    await main.run()

    expect(exec.exec).toHaveBeenCalledWith(
      'git',
      ['log', '-1', '--pretty=%B'],
      expect.anything()
    )
    expect(exec.exec).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['diff']),
      expect.anything()
    )
  })

  it('handles different statuses correctly', async () => {
    const statuses = ['success', 'failure', 'cancelled']

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
            : 'Deployment Cancelled'

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
      if (name === 'last_sha') return 'mock-sha'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff')) {
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

  it('catches and handles errors', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      return ''
    })

    jest.spyOn(exec, 'exec').mockImplementation(async () => {
      throw new Error('Test error')
    })

    await main.run()

    expect(setFailedMock).toHaveBeenCalledWith('Test error')
  })

  it('handles errors during git diff execution', async () => {
    getInputMock.mockImplementation(name => {
      if (name === 'teams_webhook') return 'https://mock-teams-webhook-url'
      if (name === 'status') return 'success'
      if (name === 'last_sha') return 'mock-sha'
      return ''
    })

    jest
      .spyOn(exec, 'exec')
      .mockImplementation(async (command, args, options) => {
        if (command === 'git' && (args ?? []).includes('log')) {
          options?.listeners?.stdout?.(Buffer.from('Mock commit message\n'))
        } else if (command === 'git' && (args ?? []).includes('diff')) {
          options?.listeners?.stderr?.(Buffer.from('Mock error message\n')) // Simulate error
        }
        return 0
      })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    })

    await main.run()

    // Verify that the error was captured
    expect(setFailedMock).toHaveBeenCalledWith(
      expect.stringContaining('Mock error message')
    )
  })
})
