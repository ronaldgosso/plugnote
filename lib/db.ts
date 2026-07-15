import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Run schema migration automatically on startup in development mode
if (process.env.NODE_ENV !== "production") {
  const lockFile = path.join(process.cwd(), ".db-migrated");
  if (!fs.existsSync(lockFile)) {
    try {
      console.log("[Db Auto-Migrate] Starting db push...");
      execSync("npx prisma db push", { stdio: "inherit" });
      console.log("[Db Auto-Migrate] Starting prisma generate...");
      execSync("npx prisma generate", { stdio: "inherit" });
      fs.writeFileSync(lockFile, "done");
      console.log("[Db Auto-Migrate] Migration successfully applied!");
    } catch (err) {
      console.error("[Db Auto-Migrate] Failed to automatically migrate DB:", err);
    }
  }
}

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const db = globalThis.prisma ?? prismaClientSingleton();

export default db;

if (process.env.NODE_ENV !== "production") globalThis.prisma = db;
