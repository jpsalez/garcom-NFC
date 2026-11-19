import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { injectable } from "tsyringe";
import type { IStorageProvider } from "./storage.interface.ts";
@injectable()
export class LocalStorageProvider implements IStorageProvider {
  private root = path.resolve(process.env.MEDIA_ROOT ?? path.join(process.cwd(), ".media"));
  private resolve(key: string) {
    if (
      !/^[a-zA-Z0-9_/.-]+$/.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Chave de armazenamento inválida");
    const file = path.resolve(this.root, key);
    if (!file.startsWith(this.root + path.sep)) throw new Error("Chave fora do armazenamento");
    return file;
  }
  async put(key: string, bytes: Uint8Array) {
    const file = this.resolve(key),
      temporary = `${file}.tmp`;
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async open(key: string) {
    const file = this.resolve(key);
    await stat(file);
    return createReadStream(file);
  }
  async delete(key: string) {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(`${file}.tmp`, { force: true });
  }
}
