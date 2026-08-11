import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'

// Bootstrap: initialise Firebase (if needed) before rendering the app.
// In local dev, VITE_FIREBASE_* env vars are available and Firebase
// is already initialised synchronously — initFirebase() is a no-op.
// In Base44 Preview, env vars are not available, so initFirebase()
// fetches the config from the GetFirebaseConfig backend function.
async function bootstrap() {
  try {
    const { initFirebase, isConfigured } = await import('@/firebase/firebaseClient')
    await initFirebase()

    if (import.meta.env.DEV) {
      const mode = isConfigured ? 'Firebase' : 'Base44 fallback'
      console.log(`Backend mode: ${mode}`)
    }
  } catch (err) {
    console.warn('[Bootstrap] Firebase initialisation failed, falling back to Base44:', err)
  }

  const { default: App } = await import('@/App.jsx')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
}

bootstrap()