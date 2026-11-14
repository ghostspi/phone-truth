import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdbConnectionProvider } from "./connection/AdbConnectionContext";
import App from "./App";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdbConnectionProvider>
        <App />
      </AdbConnectionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);