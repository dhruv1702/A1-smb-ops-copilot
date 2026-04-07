import { promises as fs } from "node:fs";
import { accessSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
export const runtime = "nodejs";

function findRepoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];
  for (const candidate of candidates) {
    const backendRunner = path.join(candidate, "backend", "run_daily_brief.py");
    try {
      accessSync(backendRunner);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Could not locate repository root with backend runner.");
}

export async function GET() {
  try {
    const repoRoot = findRepoRoot();
    const python = process.env.PYTHON_BIN ?? "python3";

    await execFileAsync(python, ["backend/scripts/build_demo_business_state.py"], {
      cwd: repoRoot,
    });

    const outputPath = path.join(tmpdir(), `daily_brief_${randomUUID()}.json`);
    await execFileAsync(
      python,
      ["backend/run_daily_brief.py", "backend/data/demo_inputs/business_state.json", outputPath],
      { cwd: repoRoot },
    );

    const raw = await fs.readFile(outputPath, "utf-8");
    await fs.unlink(outputPath).catch(() => undefined);
    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build daily brief.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
