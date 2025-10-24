import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

const root = createRoot(document.getElementById('root')!);
const theme = createTheme({
  palette: {
    mode: 'light'
  }
});

root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
);
