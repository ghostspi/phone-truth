import { useAdbConnection } from "../connection/useAdbConnection";

export function ConnectPage() {
  const { state, error, session, connect, disconnect, clearError } = useAdbConnection();

  return (
    <div className="page-container">
      <h2>Connect Your Android Device</h2>
      <p>Connect your phone via USB cable, ensure USB Debugging is enabled in Developer Options, and click below.</p>
      
      {error && (
        <div className="error-box">
          <p>{error}</p>
          <button onClick={clearError} className="btn-small">Dismiss</button>
        </div>
      )}

      <div className="connect-action-box">
        {session ? (
          <div>
            <p className="success-text">Connected to: <strong>{session.snapshot.manufacturer} {session.snapshot.model}</strong></p>
            <button onClick={disconnect} className="btn-danger">Disconnect Device</button>
          </div>
        ) : (
          <button 
            onClick={connect} 
            disabled={state === "WAITING_FOR_DEVICE" || state === "CONNECTING"}
            className="btn-primary"
          >
            {state === "WAITING_FOR_DEVICE" ? "Waiting for USB selection..." : "Request USB Connection"}
          </button>
        )}
      </div>
    </div>
  );
}