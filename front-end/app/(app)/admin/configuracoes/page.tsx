import SettingsPage from "@/components/adminComponents/settingsPage";
import RequireAuth from "@/components/requireAuth";

export default function Configuracoes() {
  return (
    <RequireAuth roles={["OWNER", "STAFF", "SUPER_ADMIN"]}>
      <SettingsPage />
    </RequireAuth>
  );
}
