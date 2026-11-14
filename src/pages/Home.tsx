import { Link } from "react-router-dom";
import { useAdbConnection } from "../connection/useAdbConnection";

export function Home() {
  const { state, session } = useAdbConnection();

  return (
    <div className="page-container">
      <div className="hero-section">
        <h1>PHONE TRUTH</h1>
        <p className="hero-subtitle">Know What Your Phone Is Really Hiding</p>
        <p className="hero-description">
          An honest, read-only hardware and software diagnostic tool for Android. No fake scores, no sample data — just direct evidence pulled straight from your device via WebUSB.
        </p>
        <div className="hero-actions">
          {session ? (
            <Link to="/diagnostics" className="btn-primary">Run Diagnostics</Link>
          ) : (
            <Link to="/connect" className="btn-primary">Connect Device</Link>
          )}
          <Link to="/about" className="btn-secondary">Learn More</Link>
        </div>
      </div>
      <div className="status-banner">
        <h3>Current Connection Status</h3>
        <p className={`status-text ${state.toLowerCase()}`}>{state}</p>
      </div>
    </div>
  );
}