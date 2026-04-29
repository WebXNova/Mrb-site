import { BrowserRouter } from 'react-router-dom';
import AppRouter from './routes/AppRouter';

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <AppRouter />
    </BrowserRouter>
  );
}
