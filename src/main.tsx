import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ResetPassword } from './components/ResetPassword.tsx'

const isPasswordRecovery = window.location.pathname === '/reset-password'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isPasswordRecovery ? <ResetPassword /> : <App />}
    </AuthProvider>
  </StrictMode>,
)
