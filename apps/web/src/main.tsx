import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.tsx'
import {
  createTrustedSessionBootstrap,
  getDefaultWebIdentityMode
} from './auth/session.ts'
import './styles.css'

const container = document.getElementById('root')
const queryClient = new QueryClient()
const identityMode = getDefaultWebIdentityMode()
const sessionBootstrap =
  identityMode === 'trusted' ? createTrustedSessionBootstrap() : undefined

if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App
        identityMode={identityMode}
        {...(sessionBootstrap ? { sessionBootstrap } : {})}
      />
    </QueryClientProvider>
  </React.StrictMode>
)
