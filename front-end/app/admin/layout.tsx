import AdminNav from "@/components/adminComponents/adminNav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
    return(
        <div className="w-full flex flex-col">
            <AdminNav />
            {children}
        </div>
    )
}
