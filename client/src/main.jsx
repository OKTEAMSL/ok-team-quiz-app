import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './styles/index.css'
import App from './App.jsx'
import HostView from './pages/HostView.jsx'
import AdminView from './pages/AdminView.jsx'
import AuthGuard from './guards/AuthGuard.jsx'
import Landing from './pages/Landing.jsx'
import ErrorBoundary from './components/common/ErrorBoundary'
import './styles/ErrorBoundary.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />  
        <Route path="/play" element={<App />} />  
        <Route path="/admin" element={
          <AuthGuard> 
            <AdminView /> 
          </AuthGuard>
        }/>        
        <Route path="/host" element={
          <AuthGuard subtitle="Pantalla del Presentador">
            <HostView />
          </AuthGuard>
        }/>
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)