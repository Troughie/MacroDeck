import React from 'react';
import ReactDOM from 'react-dom/client';
import { NotificationApp } from './components/Toast/NotificationApp';
import "./notification.css"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NotificationApp />
  </React.StrictMode>
);
