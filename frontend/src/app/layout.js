import "./globals.css";

export const metadata = {
  title: "Meteora — Data Visualisation Studio",
  description: "Upload once. Explore everything.",
  icons: {
    icon: "/landing/logo-actual.ico",
    shortcut: "/landing/logo-actual.ico",
    apple: "/landing/logo-actual.ico",
  },
};


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}