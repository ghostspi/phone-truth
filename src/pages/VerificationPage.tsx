import { ConnectionGuard } from "../components/ConnectionGuard";

export function VerificationPage() {
  return (
    <ConnectionGuard>
      <div className="page-container">
        <h2>Manual Hardware Verification</h2>
        <p>Some hardware attributes (such as screen dead pixels, touch responsiveness, and sensor behavior) require direct human interaction.</p>
        <ul className="checklist">
          <li><strong>Display Test:</strong> Check for dead pixels and color uniformity across solid white, black, red, green, and blue backgrounds.</li>
          <li><strong>Touch Test:</strong> Drag your finger across the entire edge and center of the screen to check for dead touch zones.</li>
          <li><strong>Proximity Test:</strong> Cover the top speaker during a call simulation to check if the screen blanks out.</li>
        </ul>
      </div>
    </ConnectionGuard>
  );
}