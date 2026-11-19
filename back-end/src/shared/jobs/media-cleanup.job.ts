import type { IMediaService } from "../../modules/media/media.interfaces.ts";
export function startMediaCleanupJob(service: Pick<IMediaService, "cleanup">) {
  return setInterval(() => {
    service.cleanup().catch(() => console.error("Falha na limpeza de mídia"));
  }, 3600000).unref();
}
