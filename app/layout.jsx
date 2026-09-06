import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: {
    default: "Newflows",
    template: "%s | Newflows",
  },
  description:
    "Organize projects, prioritize tasks, and manage workflows with Newflows.",
  applicationName: "Newflows",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}