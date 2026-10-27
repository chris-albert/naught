/**
 * Runs a prompt naught built through Claude with the person's own key, straight from the
 * browser (there is no server). The SDK is loaded on first use so it stays out of the main
 * bundle for people who never turn the AI features on.
 */

export const MODEL = 'claude-opus-5-5'

/**
 * Stream `prompt` through Claude, calling `onText` with each piece of the answer as it is
 * written. Resolves with the whole answer. Throws with Anthropic's own message when the
 * request is rejected (bad key, no credit), or a short one when the answer was cut off.
 */
export async function askClaude(key: string, prompt: string, onText: (piece: string) => void): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 })
  let message
  try {
    const stream = client.messages.stream({
      model: MODEL,
      // Room for a long answer plus the model's own thinking; a cost cap, not a target.
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    })
    stream.on('text', onText)
    message = await stream.finalMessage()
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your connection and try again.')
    if (e instanceof Anthropic.APIError) throw new Error(apiMessage(e))
    throw e
  }
  if (message.stop_reason === 'refusal') throw new Error(message.stop_details?.explanation ?? 'Claude declined to answer this one.')
  if (message.stop_reason === 'max_tokens') throw new Error('The answer was cut off at the length limit. Run again for a fresh one.')
  return message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

/** The message Anthropic put in the error body, falling back to the SDK's status line. */
export function apiMessage(e: { message: string; error?: unknown }): string {
  const body = e.error as { error?: { message?: string } } | undefined
  return body?.error?.message ?? e.message
}
