import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { setUnauthorizedHandler } from './lib/api';
import { qk, queryClient } from './lib/queryClient';
import './index.css';

// Any 401 means the session cookie expired or was cleared: drop cached data and go to /login.
setUnauthorizedHandler(() => {
  queryClient.clear();
  queryClient.setQueryData(qk.me, null);
  if (window.location.pathname !== '/login') window.location.assign('/login');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ style: { fontSize: 14, borderRadius: 10 }, success: { iconTheme: { primary: '#00a540', secondary: '#fff' } } }} />
    </QueryClientProvider>
  </StrictMode>,
);
