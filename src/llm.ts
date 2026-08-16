export interface StreamOptions {
  endpoint: string
  model: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  system?: string
  temperature?: number
  maxTokens?: number
  // Disable the model's thinking phase (llama.cpp + reasoning chat templates
  // like Qwen 3.6). Small JSON calls (extraction, shortlist) MUST set this:
  // reasoning alone can exceed their max_tokens, returning empty content and
  // silently degrading the pipeline to its recency fallback. Servers without
  // template kwargs support simply ignore the extra field.
  noThink?: boolean
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>
}

/**
 * Streams a chat completion from any OpenAI-compatible local model server.
 * Compatible with llama.cpp server, Ollama, LM Studio, etc.
 */
export async function* streamCompletion({
  endpoint,
  model,
  messages,
  system,
  temperature = 0.7,
  maxTokens = 2048,
  noThink = false,
}: StreamOptions): AsyncGenerator<string> {
  const fullMessages = system
    ? [{ role: 'system' as const, content: system }, ...messages]
    : messages

  const res = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'local',
      messages: fullMessages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      ...(noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`LLM error ${res.status}: ${text}`)
  }

  if (!res.body) throw new Error('Response body is null')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as ChatCompletionChunk
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}

export async function checkConnection(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
