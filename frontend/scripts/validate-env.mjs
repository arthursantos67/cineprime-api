import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredPublicEnv = ["NEXT_PUBLIC_API_BASE_URL"];

const nodeEnv = process.env.NODE_ENV;
const envFiles = [
  ".env",
  nodeEnv ? `.env.${nodeEnv}` : null,
  ".env.local",
  nodeEnv ? `.env.${nodeEnv}.local` : null,
].filter(Boolean);

const fileEnv = Object.assign({}, ...envFiles.map(readEnvFile));
const missingVariables = requiredPublicEnv.filter(
  (name) => !getEnvValue(name, fileEnv)
);

if (missingVariables.length > 0) {
  console.error(
    `Missing required frontend environment variable: ${missingVariables.join(", ")}`
  );
  process.exit(1);
}

const apiBaseUrl = getEnvValue("NEXT_PUBLIC_API_BASE_URL", fileEnv);

try {
  const parsedUrl = new URL(apiBaseUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("URL must use http or https");
  }
} catch {
  console.error(
    "NEXT_PUBLIC_API_BASE_URL must be an absolute http(s) URL, for example http://localhost:8000"
  );
  process.exit(1);
}

function getEnvValue(name, fallbackEnv) {
  return process.env[name]?.trim() || fallbackEnv[name]?.trim() || "";
}

function readEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName);

  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const name = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");

        return [name, value];
      })
  );
}
