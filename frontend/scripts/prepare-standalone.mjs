import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const standaloneDir = resolve(process.cwd(), ".next/standalone");

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

copyIfExists(".next/static", ".next/standalone/.next/static");
copyIfExists("public", ".next/standalone/public");

function copyIfExists(source, destination) {
  const sourcePath = resolve(process.cwd(), source);

  if (!existsSync(sourcePath)) {
    return;
  }

  cpSync(sourcePath, resolve(process.cwd(), destination), {
    force: true,
    recursive: true,
  });
}
