export function AboutPage() {
  return (
    <div className="page-container">
      <h2>About Phone Truth</h2>
      <p>
        PHONE TRUTH is built to give everyday users complete transparency over their Android hardware. By utilizing secure browser WebUSB and native ADB commands, it bypasses modified software overlays and reads partition tables, kernel memory info, and build configurations directly.
      </p>
      <h3>Core Principles</h3>
      <ul>
        <li><strong>No Sample Data:</strong> Every metric is pulled live or marked unavailable.</li>
        <li><strong>Read-Only Safety:</strong> PHONE TRUTH never modifies system state or unlocks bootloaders.</li>
        <li><strong>Open & Verifiable:</strong> Open source codebase inspectable right in your browser.</li>
      </ul>
    </div>
  );
}