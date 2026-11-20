import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentConfig } from "./types.ts";

export function defaultConfigPath(): string {
  return process.env.PRINT_AGENT_CONFIG || path.join(os.homedir(), ".config", "garcom-print-agent.json");
}

export function defaultEmulatorOutputPath(): string {
  return (
    process.env.PRINT_EMULATOR_OUTPUT ||
    path.join(os.homedir(), ".local", "share", "garcom-print-agent", "emulator-output.txt")
  );
}

export function saveConfig(config: AgentConfig, configPath = defaultConfigPath()): string {
  const resolved = path.resolve(configPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const content = `${JSON.stringify(config, null, 2)}\n`;
  fs.writeFileSync(resolved, content, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(resolved, 0o600);
  return resolved;
}

export function loadConfig(configPath = defaultConfigPath()): AgentConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuração não encontrada em ${resolved}. Execute 'pair <codigo>' primeiro.`);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<AgentConfig>;
  if (!raw.apiUrl || !raw.credential || raw.destination !== "KITCHEN") {
    throw new Error(`Configuração inválida em ${resolved}.`);
  }
  return {
    apiUrl: raw.apiUrl,
    destination: raw.destination,
    credential: raw.credential,
    transport: raw.transport === "lp" ? "lp" : "emulator",
    printer: raw.printer,
    emulatorOutputPath: raw.emulatorOutputPath,
  };
}

export function tryLoadConfig(configPath = defaultConfigPath()): AgentConfig | null {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) return null;
  return loadConfig(resolved);
}
