import { Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Home } from "./pages/Home";
import { ConnectPage } from "./pages/ConnectPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { VerificationPage } from "./pages/VerificationPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AboutPage } from "./pages/AboutPage";

export default function App() {
  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
    </div>
  );
}