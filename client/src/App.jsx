import { Link, Routes, Route, useLocation } from "react-router-dom";
import AllModels from "./pages/AllModels.jsx";
import Browse from "./pages/Browse.jsx";
import ModelDetail from "./pages/ModelDetail.jsx";

export default function App() {
  const location = useLocation();
  const onBrowse = location.pathname.startsWith("/browse");

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">🧊 StlStash</span>
          <nav className="tabs">
            <Link to="/" className={!onBrowse ? "active" : ""}>All Models</Link>
            <Link to="/browse" className={onBrowse ? "active" : ""}>Browse</Link>
          </nav>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<AllModels />} />
          <Route path="/browse/*" element={<Browse />} />
          <Route path="/model/*" element={<ModelDetail />} />
        </Routes>
      </main>
    </div>
  );
}
