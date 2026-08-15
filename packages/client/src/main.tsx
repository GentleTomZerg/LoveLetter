import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LocaleProvider } from './i18n';
import { ThemeProvider } from './theme';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/karla/400.css';
import '@fontsource/karla/500.css';
import '@fontsource/karla/700.css';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
