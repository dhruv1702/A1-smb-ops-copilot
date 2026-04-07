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

function getPythonBin(): string {
  return process.env.PYTHON_BIN ?? "python3";
}

async function readJson(pathname: string): Promise<unknown> {
  const raw = await fs.readFile(pathname, "utf-8");
  return JSON.parse(raw);
}

async function buildDemoBrief(): Promise<unknown> {
  const repoRoot = findRepoRoot();
  const python = getPythonBin();
  const outputPath = path.join(tmpdir(), `daily_brief_${randomUUID()}.json`);

  try {
    await execFileAsync(python, ["backend/scripts/build_demo_business_state.py"], {
      cwd: repoRoot,
    });
    await execFileAsync(
      python,
      ["backend/run_daily_brief.py", "backend/data/demo_inputs/business_state.json", outputPath],
      { cwd: repoRoot },
    );
    return await readJson(outputPath);
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
  }
}

async function buildBriefFromInputs(payload: unknown): Promise<unknown> {
  const repoRoot = findRepoRoot();
  const python = getPythonBin();
  const inputPath = path.join(tmpdir(), `daily_brief_inputs_${randomUUID()}.json`);
  const outputPath = path.join(tmpdir(), `daily_brief_${randomUUID()}.json`);

  try {
    await fs.writeFile(inputPath, JSON.stringify(payload), "utf-8");
    await execFileAsync(
      python,
      ["backend/scripts/build_daily_brief_from_inputs.py", inputPath, outputPath],
      { cwd: repoRoot },
    );
    return await readJson(outputPath);
  } finally {
    await fs.unlink(inputPath).catch(() => undefined);
    await fs.unlink(outputPath).catch(() => undefined);
  }
}

export async function GET() {
  try {
    return NextResponse.json(await buildDemoBrief());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build daily brief.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await buildBriefFromInputs(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build daily brief.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
