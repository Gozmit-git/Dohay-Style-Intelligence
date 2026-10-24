import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "dohay-owner-tests-"));
try {
  const stub = join(dir, "isolated-services.ts");
  await writeFile(stub, `
    export class MvpError extends Error { constructor(public status: number, message: string) { super(message); } }
    export const validId = (value: string) => value;
    export const getOwnerSnapshot = async () => { throw new Error("Tests must inject their data source"); };
  `);
  const outfile = join(dir, "owner.test.cjs");
  await build({
    entryPoints: ["tests/owner-admin.test.ts"], outfile, bundle: true, platform: "node", format: "cjs",
    plugins: [{ name: "isolated-services", setup(build) {
      build.onResolve({ filter: /\/(mvpData|ownerAccounts)$/ }, () => ({ path: stub }));
    } }],
  });
  process.exitCode = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" }).status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }
