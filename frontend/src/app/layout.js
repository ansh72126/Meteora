import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://meteorraa.vercel.app"),
  title: "Meteora — Data Visualisation Studio",
  description: "Upload once. Explore everything.",
  icons: {
    icon: "/landing/logo-actual.ico",
    shortcut: "/landing/logo-actual.ico",
    apple: "/landing/logo-actual.ico",
  },
  openGraph: {
    title: "Meteora — Data Visualisation Studio",
    description: "Upload once. Explore everything.",
    url: "https://meteorraa.vercel.app",
    siteName: "Meteora",
    type: "website",
    images: [
      {
        url: "/landing/cover-logo-browser.jpg",
        width: 1200,
        height: 630,
        alt: "Meteora social preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meteora — Data Visualisation Studio",
    description: "Upload once. Explore everything.",
    images: ["/landing/cover-logo-browser.jpg"],
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