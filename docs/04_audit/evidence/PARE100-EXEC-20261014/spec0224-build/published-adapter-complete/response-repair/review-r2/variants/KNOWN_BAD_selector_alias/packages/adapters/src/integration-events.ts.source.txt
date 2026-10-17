export interface IntegrationEvent {
  provider: string
  operation: string
  status: 'started' | 'succeeded' | 'failed'
  correlationId: string
}
