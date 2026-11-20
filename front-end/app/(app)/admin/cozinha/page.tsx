'use client'

import CozinhaPage from "@/components/cozinhaComponents/cozinhaPage";
import RequireAuth from "@/components/requireAuth";
import { canAccessKitchen } from "@/lib/kitchenQueue";

export default function Cozinha() {
  return (
    <RequireAuth roles={["OWNER", "STAFF"]} canAccess={canAccessKitchen}>
      <CozinhaPage />
    </RequireAuth>
  );
}
