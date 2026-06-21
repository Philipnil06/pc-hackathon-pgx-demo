import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LaunchPage } from "./pages/LaunchPage";
import { AppPage } from "./pages/AppPage";
import "./styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="*" element={<Navigate to="/app?mock=1" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
