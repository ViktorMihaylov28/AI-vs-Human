import "@/styles/globals.css";
import { ConvexProvider } from "@/convex/client";

export default function MyApp({ Component, pageProps }) {
  return (
    <ConvexProvider>
      <Component {...pageProps} />
    </ConvexProvider>
  );
}