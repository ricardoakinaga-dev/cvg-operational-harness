import { defineConfig } from '@playwright/test'
import base from './playwright.rem21-014.config.ts'
if (!Array.isArray(base.webServer)) throw new Error('Expected two servers')
export default defineConfig({ ...base, retries: 0, workers: 1, webServer: base.webServer.map((server,index)=>({...server, reuseExistingServer: false, command: index===0 ? server.command!.replace('npm run dev:api','node --import tsx scripts/aud0591-loopback-main.ts') : server.command+' --host 127.0.0.1 --strictPort'})) })
