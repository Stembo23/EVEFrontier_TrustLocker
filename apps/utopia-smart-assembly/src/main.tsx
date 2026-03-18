import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import { Theme } from "@radix-ui/themes";
import App from "./App";
import "./main.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme appearance="light" accentColor="orange" grayColor="sand" radius="large">
      <EveFrontierProvider queryClient={queryClient}>
        <App />
      </EveFrontierProvider>
    </Theme>
  </React.StrictMode>,
);
