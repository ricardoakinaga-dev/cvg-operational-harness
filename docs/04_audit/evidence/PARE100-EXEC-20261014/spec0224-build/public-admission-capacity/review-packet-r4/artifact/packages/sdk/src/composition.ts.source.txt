import { InMemorySessionEventStore } from '@cvg/harness'
import type { SessionEvent } from '@cvg/harness-contracts'
import {
  createInProcessTransport,
  createSdkClient,
  type SdkClient,
  type SdkReadEventsOptions
} from './client.ts'
import {
  createSdkServer,
  type SdkServer,
  type SdkServerOptions
} from './server.ts'
import type {
  SdkHelloResult,
  SessionOpenResult,
  TurnSendResult
} from './protocol.ts'

export type SdkCompositionOptions = SdkServerOptions

export interface SdkFacade {
  readonly server: SdkServer
  readonly client: SdkClient
  hello(): Promise<SdkHelloResult>
  openSession(sessionId: string): Promise<SessionOpenResult>
  sendTurn(sessionId: string, userMessage: string): Promise<TurnSendResult>
  readEvents(
    sessionId: string,
    options?: SdkReadEventsOptions
  ): Promise<readonly SessionEvent[]>
}

/**
 * Full SDK composition: session events enabled. The store defaults to the
 * in-memory fixture; hosts inject a durable store for multi-process use.
 */
export function createSdk(options: SdkCompositionOptions): SdkFacade {
  const server = createSdkServer({
    ...options,
    sessions: options.sessions ?? new InMemorySessionEventStore()
  })
  const client = createSdkClient(createInProcessTransport(server))
  return {
    server,
    client,
    hello: () => client.hello(),
    openSession: (sessionId) => client.openSession(sessionId),
    sendTurn: (sessionId, userMessage) =>
      client.sendTurn(userMessage, sessionId),
    readEvents: (sessionId, readOptions) =>
      client.readEvents(sessionId, readOptions)
  }
}

/** Session methods are not part of the minimal composition. */
export type SdkMinimalOptions = Omit<SdkServerOptions, 'sessions'>

export interface SdkMinimalFacade {
  readonly server: SdkServer
  readonly client: SdkClient
  hello(): Promise<SdkHelloResult>
  sendTurn(userMessage: string): Promise<TurnSendResult>
}

/** Minimal SDK composition: stateless turns, no session store. */
export function createSdkMinimal(options: SdkMinimalOptions): SdkMinimalFacade {
  const server = createSdkServer(options)
  const client = createSdkClient(createInProcessTransport(server))
  return {
    server,
    client,
    hello: () => client.hello(),
    sendTurn: (userMessage) => client.sendTurn(userMessage)
  }
}
