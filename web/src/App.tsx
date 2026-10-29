import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Manage } from './pages/Manage';

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" alt="" width={24} height={24} />
            Visa Exchange Rates
          </NavLink>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/manage">Manage</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history/:from/:to" element={<History />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="muted small">Rates from Visa's public FX calculator, refreshed daily.</footer>
    </BrowserRouter>
  );
}
