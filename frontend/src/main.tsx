/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './utils/timezoneInterceptor'
import './utils/patchAntdMessage'
import './i18n'
import './index.css'
import { AppThemeProvider } from './components/AppThemeProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </React.StrictMode>,
)
