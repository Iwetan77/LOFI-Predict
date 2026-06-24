import React from "react";
import ReactDOM from "react-dom/client";
import { getFullnodeUrl } from "@mysten/sui/client";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "@mysten/dapp-kit/dist/index.css";
import "./index.css";

// Everything is TESTNET — DeepBook Predict + DUSDC only exist there.
const { networkConfig } = createNetworkConfig({ testnet: { url: getFullnodeUrl("testnet") } });
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
