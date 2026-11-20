export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return(
        <div className="w-full flex flex-col">
            {children}
        </div>
    )
}
