import { Link, useLocation } from "react-router-dom";
import { useAdbConnection } from "../connection/useAdbConnection";

export function Navbar() {
  const { state } = useAdbConnection();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="brand-logo">PHONE TRUTH</Link>
        <span className={`connection-badge ${state.toLowerCase()}`}>
          {state}
        </span>
      </div>
      <div className="navbar-links">
        <Link to="/" className={isActive("/") ? "active" : ""}>Home</Link>
        <Link to="/connect" className={isActive("/connect") ? "active" : ""}>Connect</Link>
        <Link to="/diagnostics" className={isActive("/diagnostics") ? "active" : ""}>Diagnostics</Link>
        <Link to="/verification" className={isActive("/verification") ? "active" : ""}>Verification</Link>
        <Link to="/reports" className={isActive("/reports") ? "active" : ""}>Reports</Link>
        <Link to="/about" className={isActive("/about") ? "active" : ""}>About</Link>
      </div>
    </nav>
  );
}