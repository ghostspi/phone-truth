import { useContext } from "react";
import { AdbConnectionContext } from "./AdbConnectionContext";

export function useAdbConnection() {
  const context = useContext(AdbConnectionContext);
  if (!context) {
    throw new Error("useAdbConnection must be used inside AdbConnectionProvider.");
  }
  return context;
}