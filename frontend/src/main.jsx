import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

const style = document.createElement('style')
style.textContent = `
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         background: #f1f5f9; color: #1f2937; -webkit-font-smoothing: antialiased; }
  input, select, button, textarea { font-family: inherit; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; }
`
document.head.appendChild(style)

createRoot(document.getElementById('root')).render(<App />)
