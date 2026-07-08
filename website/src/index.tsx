import { LocationProvider, Router, Route, hydrate, prerender as ssr } from "preact-iso";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Blog } from "./pages/Writing";
import { Product } from "./pages/Product";
import { NotFound } from "./pages/_404";
import "./style.css";

export function App() {
  return (
    <LocationProvider>
      <div class="flex min-h-screen flex-col bg-white">
        <Header />
        <main class="flex-1">
        <Router>
          {[
            <Route path="/" component={Home} />,
            <Route path="/product" component={Product} />,
            <Route path="/writing" component={Blog} />,
            <Route default component={NotFound} />,
          ]}
        </Router>
        </main>
        <Footer />
      </div>
    </LocationProvider>
  );
}

if (typeof window !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    hydrate(<App />, root);
  }
}

export async function prerender() {
  return await ssr(<App />);
}
