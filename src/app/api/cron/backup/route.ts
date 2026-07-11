import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO M0: implement pg_dump → Vercel Blob or GitHub Action
  console.log("[cron/backup] triggered at", new Date().toISOString());

  return NextResponse.json({
    ok: true,
    message: "Backup stub — database not connected yet",
    timestamp: new Date().toISOString(),
  });
}
