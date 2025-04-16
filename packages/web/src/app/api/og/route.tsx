import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          background: "#000",
          color: "#fff",
          width: "100%",
          height: "100%",
          padding: 50,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <img
          src="https://degov-dev.vercel.app/assets/image/logo.svg"
          alt="Logo"
          width="200"
        />
        <h1 style={{ fontSize: 60 }}>DeGov - DAO governance platform</h1>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
