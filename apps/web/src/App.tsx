import { CONTRACT_VERSION } from "@nop/contracts";

export function App() {
  return (
    <main data-contract-version={CONTRACT_VERSION}>
      <h1>Network Operations Platform</h1>
      <p>Web runtime version=dev</p>
    </main>
  );
}
