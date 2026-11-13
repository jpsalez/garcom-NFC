export default function MesaPage() {
    return(
        <>
        <div className="w-full flex flex-col items-center justify-center py-5">
            
            <div className="flex flex-none flex-col items-center justify-center">
                <h3>Mesa</h3>
                <h2 className="text-3xl">X</h2>
            </div>

            <div className="w-full flex-1 flex flex-col items-center justify-center p-5 space-y-5">
                <button className="w-full background outline rounded-sm p-3 shadow-lg">
                    Chamar Garçom
                </button>
                
                <button className="w-full background outline rounded-sm p-3 shadow-lg">
                    Avaliar Atendimento
                </button>
            </div>

            <div className="w-full flex-none flex items-center justify-center p-5">
                <button className="w-full background outline rounded-sm p-3 shadow-lg">
                    Chamar Garçom
                </button>
            </div>
        </div>
        </>
    )
}