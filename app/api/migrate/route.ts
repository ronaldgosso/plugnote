import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  const logs: string[] = [];
  try {
    logs.push("Running prisma db push...");
    const pushOutput = execSync("npx prisma db push", { encoding: "utf-8" });
    logs.push("Push success: " + pushOutput);
  } catch (err: any) {
    logs.push("Push failed: " + err.message);
    if (err.stdout) logs.push("stdout: " + err.stdout);
    if (err.stderr) logs.push("stderr: " + err.stderr);
  }

  try {
    logs.push("Running prisma generate...");
    const genOutput = execSync("npx prisma generate", { encoding: "utf-8" });
    logs.push("Generate success: " + genOutput);
  } catch (err: any) {
    logs.push("Generate failed: " + err.message);
    if (err.stdout) logs.push("stdout: " + err.stdout);
    if (err.stderr) logs.push("stderr: " + err.stderr);
  }

  return NextResponse.json({ success: true, logs });
}
