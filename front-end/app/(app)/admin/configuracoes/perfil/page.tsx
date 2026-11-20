import ProfilePage from "@/components/adminComponents/profilePage";
import RequireAuth from "@/components/requireAuth";

export default function Perfil() {
  return (
    <RequireAuth roles={["OWNER", "STAFF", "SUPER_ADMIN"]}>
      <ProfilePage />
    </RequireAuth>
  );
}
