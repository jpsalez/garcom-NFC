import busboy from "busboy";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { actorOf } from "../../shared/middlewares/auth.middleware.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ValidationError } from "../../shared/errors/http-errors.ts";
import type { IMediaService } from "./media.interfaces.ts";

async function readUpload(req: Request): Promise<{ bytes: Buffer; mime: string }> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 2, fields: 1, parts: 3, fileSize: 8388609, headerPairs: 50 },
      });
    } catch {
      reject(new ValidationError(undefined, "Envie uma imagem multipart no campo file"));
      return;
    }
    let error: Error | undefined,
      bytes = Buffer.alloc(0),
      mime = "",
      found = false;
    parser.on("file", (field, stream, info) => {
      if (found) {
        error = new ValidationError(undefined, "Envie somente um arquivo");
        stream.resume();
        return;
      }
      if (field !== "file") error = new ValidationError(undefined, "Campo de arquivo inválido");
      found = true;
      mime = info.mimeType;
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 8388608) chunks.push(chunk);
        else error = new AppError("Arquivo excede 8 MiB", 413, undefined, "UPLOAD_TOO_LARGE");
      });
      stream.on("error", reject);
      stream.on("end", () => {
        bytes = Buffer.concat(chunks);
      });
    });
    parser.on("field", () => {
      error = new ValidationError(undefined, "Envie somente o arquivo");
    });
    for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const)
      parser.on(event, () => {
        error = new ValidationError(undefined, "Envie somente um arquivo");
      });
    parser.on("error", reject);
    const aborted = () => reject(new ValidationError(undefined, "Upload interrompido"));
    req.once("aborted", aborted);
    parser.on("close", () => {
      req.off("aborted", aborted);
      if (error) reject(error);
      else if (!found) reject(new ValidationError(undefined, "Arquivo não informado"));
      else resolve({ bytes, mime });
    });
    req.pipe(parser);
  });
}
@injectable()
export class MediaController {
  constructor(@inject("MediaService") private service: IMediaService) {}
  upload = async (req: Request, res: Response) => {
    const release = this.service.acquire();
    try {
      const file = await readUpload(req);
      return res.status(201).json(await this.service.upload(actorOf(req), file.bytes, file.mime));
    } finally {
      release();
    }
  };
  remove = async (req: Request, res: Response) => {
    await this.service.remove(actorOf(req), String(req.params.id));
    return res.sendStatus(204);
  };
  open = (isPublic: boolean) => async (req: Request, res: Response) => {
    const kind = z.enum(["main", "thumb"]).parse(req.params.variant);
    const stream = await this.service.open(
      String(req.params.id),
      kind === "main" ? "MAIN" : "THUMB",
      isPublic ? undefined : actorOf(req),
    );
    res.type("image/webp").setHeader("Cache-Control", isPublic ? "public, max-age=300" : "no-store");
    await pipeline(stream, res);
  };
}
