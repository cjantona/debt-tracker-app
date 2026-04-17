import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function showRuntimeError(message) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('runtime-fatal-error')
  if (!el) {
    el = document.createElement('pre')
    el.id = 'runtime-fatal-error'
    el.style.position = 'fixed'
    el.style.left = '12px'
    el.style.right = '12px'
    el.style.bottom = '12px'
    el.style.zIndex = '99999'
    el.style.maxHeight = '45vh'
    el.style.overflow = 'auto'
    el.style.whiteSpace = 'pre-wrap'
    el.style.padding = '12px'
    el.style.borderRadius = '8px'
    el.style.border = '1px solid #7f1d1d'
    el.style.background = '#111827'
    el.style.color = '#fecaca'
    document.body.appendChild(el)
  }
  el.textContent = message
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const details = event.error?.stack || event.message || 'Unknown runtime error'
    showRuntimeError(`Runtime error:\n${details}`)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.stack || event.reason?.message || String(event.reason)
    showRuntimeError(`Unhandled promise rejection:\n${reason}`)
  })
}

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Root render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', padding: 24, color: '#fecaca', background: '#0f172a' }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>App crashed while rendering</h1>
          <p style={{ marginTop: 8, color: '#fda4af' }}>
            Check the error below and share it so it can be fixed quickly.
          </p>
          <pre
            style={{
              marginTop: 16,
              whiteSpace: 'pre-wrap',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: 8,
              padding: 12,
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
