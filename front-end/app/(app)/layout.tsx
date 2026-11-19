import Header from "@/components/header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="w-full flex flex-none">
        <Header />
      </div>

      <div className="w-full flex flex-1">
        {children}
      </div>
    </>
  );
}
