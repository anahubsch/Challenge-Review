export const metadata = {
  title: "Candidate Review",
  description: "GitHub challenge scoring tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#14161a" }}>{children}</body>
    </html>
  );
}
