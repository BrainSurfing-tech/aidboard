import { Navigate, Route, Routes } from 'react-router';
import { AidProvider } from './data/useAidState.js';
import { Accueil } from './ecrans/Accueil.js';

export function App() {
  return (
    <AidProvider>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AidProvider>
  );
}
