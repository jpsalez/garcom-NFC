'use client'

import CozinhaConfigPage from "@/components/cozinhaComponents/cozinhaConfigPage";
import RequireAuth from "@/components/requireAuth";
import { canConfigurePrinting } from "@/lib/kitchenQueue";

export default function CozinhaConfiguracoes() {
  return (
    <RequireAuth roles={["OWNER", "STAFF"]} canAccess={canConfigurePrinting}>
      <CozinhaConfigPage />
    </RequireAuth>
  );
}
