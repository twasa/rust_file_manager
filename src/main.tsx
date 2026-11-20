import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { preventDefaultContextMenu } from "./utils/browserEvents";
import "./index.css";

// 全域攔截並停用 WebView 預設右鍵選單（如重新整理、另存新檔、列印等），避免瀏覽器原生網頁選單破壞桌面應用體驗
document.addEventListener("contextmenu", preventDefaultContextMenu);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
