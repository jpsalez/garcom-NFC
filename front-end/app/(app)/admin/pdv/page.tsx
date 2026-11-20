'use client'

import PdvPage from "@/components/pdvComponents/pdvPage";
import RequireAuth from "@/components/requireAuth";
import { canUsePdv } from "@/lib/kitchenQueue";

export default function Pdv() {
  return (
    <RequireAuth roles={["OWNER", "STAFF"]} canAccess={canUsePdv}>
      <PdvPage />
    </RequireAuth>
  );
}
