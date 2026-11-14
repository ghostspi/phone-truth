import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAdbConnection } from "../connection/useAdbConnection";

interface Props {
  children: ReactNode;
}

export function ConnectionGuard({ children }: Props) {
  const { session } = useAdbConnection();

  if (!session) {
    return (
      <div className="connection-guard">
        <h2>Device Not Connected</h2>
        <p>Please connect and authorize your Android device via USB to run diagnostics or view reports.</p>
        <Link to="/connect" className="btn-primary">Go to Connect Page</Link>
      </div>
    );
  }

  return <>{children}</>;
}