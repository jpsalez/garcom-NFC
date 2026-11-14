'use client'
import { getRestaurantsList } from "@/services/admin"
import { useEffect, useState } from "react"
import { FaCheckCircle, FaTrash } from "react-icons/fa";
import { FaPencil } from "react-icons/fa6";
import { IoIosWarning } from "react-icons/io";
import EditRestaurantModal from "./editRestaurantModal";
import { Restaurant, useRestaurantModal } from "@/store/restaurantModal";

export default function RestaurantsList() {
    
    const [restaurants, setRestaurants] = useState<Restaurant[]>([])

    const { open } = useRestaurantModal()
    
    useEffect( () => {

        async function loadRestaurants() {
            try {
                const data = await getRestaurantsList()
                setRestaurants(data)
            } catch(err) {
                console.log(err)
            }
        }

        loadRestaurants()
        
    }, [])    
    
    return(
        <>
            <EditRestaurantModal />
        
            <table className="w-full table-fixed border-collapse overflow-hidden rounded-xl">
                <thead className="bg-black/50">
                    <tr>
                        <th className="w-30 p-5 border-r border-white/10 ">
                            <div className="flex items-center justify-center">
                                Status
                            </div>
                        </th>

                        <th className="p-5 border-r border-white/10">
                            <div className="w-full flex items-center">
                                Nome
                            </div>
                        </th>

                        <th className="w-30 p-5">
                            <div>
                                Ações
                            </div>
                        </th>

                    </tr>
                </thead>

                <tbody>
                    {restaurants.map((r, i) => (
                        <tr key={r.id}
                        className={`
                            ${i % 2 !== 0 && 'bg-white/5'}
                        `}
                        >
                            <td className="p-5 border-r border-white/10 text-center">
                                <div className="flex items-center justify-center">
                                    {r.active && <FaCheckCircle className="text-green-600" size={20}/>}
                                    {!r.active && <IoIosWarning className="text-red-600" size={20}/>}
                                </div>
                            </td>

                            <td className="p-5 border-r border-white/10">
                                {r.name}
                            </td>

                            <td className="p-5">
                                <div className="grid grid-cols-2">
                                    <div className="flex items-center justify-center">
                                        <FaPencil 
                                        onClick={() => open(r)}
                                        className="
                                            cursor-pointer
                                            transition-all duration-300
                                            hover:scale-105 hover:text-yellow-400
                                        "
                                        />
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <FaTrash 
                                        className="
                                            cursor-pointer
                                            transition-all duration-300
                                            hover:scale-105 hover:text-red-400
                                        "
                                        />
                                    </div>
                                </div>
                            </td>
                            
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    )
}