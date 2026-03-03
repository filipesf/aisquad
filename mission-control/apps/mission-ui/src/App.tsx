import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.tsx';
import { TaskBoard } from './pages/TaskBoard.tsx';
import { TaskDetail } from './pages/TaskDetail.tsx';
import { AgentDetail } from './pages/AgentDetail.tsx';

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-gray-100'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-bold tracking-tight">
              Mission Control
            </NavLink>
            <nav className="flex items-center gap-1">
              <NavItem to="/" label="Dashboard" />
              <NavItem to="/tasks" label="Tasks" />
            </nav>
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<TaskBoard />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
