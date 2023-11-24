import { Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import { Prisma } from "@prisma/client";
import moment from "moment-timezone";

async function getAllBookings(idC: number, status?: string) {
    let idCQuery: Prisma.reservasiWhereInput = {}
    if (idC === -1) {
        idCQuery = {
            user_customer: {
                type: "g"
            }
        }
    } else {
        idCQuery = {
            id_customer: idC
        }
    }

    let statusQuery: Prisma.reservasiWhereInput = {}
    if (status === "upcoming") {
        statusQuery = {
            OR: [
                {
                    // tanggal check in > hari ini
                    arrival_date: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                },
                {
                    // tanggal check out masih di masa depan
                    departure_date: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            ],
            NOT: {
                OR: [
                    {
                        status: {
                            in: ["batal", "expired"]
                        }
                    },
                    {
                        status: {
                            startsWith: "pending-"
                        },
                        tanggal_dl_booking: {
                            lt: new Date()
                        }
                    }
                ]
            }
        }
    } else if (status === "completed") {
        statusQuery = {
            // tanggal check out < hari ini
            departure_date: {
                lt: new Date(new Date().setHours(0, 0, 0, 0))
            },
            status: {
                notIn: ["batal", "expired"]
            }
        }
    } else if (status === "cancelled") {
        statusQuery = {
            OR: [
                {
                    status: {
                        in: ["batal", "expired"]
                    }
                },
                {
                    status: {
                        startsWith: "pending-"
                    },
                    tanggal_dl_booking: {
                        lt: new Date()
                    }
                }
            ]
        }
    }

    return await prisma.reservasi.findMany({
        where: {
            ...idCQuery,
            ...statusQuery
        },
        include: {
            user_customer: true,
            user_pegawai: true,
            invoice: {
                select: {
                    no_invoice: true
                }
            }
        },
        orderBy: {
            id: 'desc',
            // arrival_date: 'asc'
        }
    })
}

async function cancelBooking(idC: number, idReservasi: number) {
    const reservasi = await prisma.reservasi.findUnique({
        where: {
            id: idReservasi,
            id_customer: idC
        }
    })

    const statusYangBolehDibatalkan = [
        "pending-1",
        "pending-2",
        "pending-3",
        "dp",
        "lunas"
        // kalau sudah check in tidak boleh lagi
    ]


    if (!reservasi) {
        throw new Error("Reservasi tidak ditemukan")
    }

    if (!statusYangBolehDibatalkan.includes(reservasi.status)) {
        throw new Error("Reservasi tidak bisa dibatalkan karena statusnya sudah tidak bisa dibatalkan")
    }

    const reservasiBelumSelesai = reservasi.status.startsWith("pending-") && reservasi.tanggal_dl_booking && reservasi.tanggal_dl_booking >= new Date()
    const reservasiSudahExpired = reservasi.status.startsWith("pending-") && reservasi.tanggal_dl_booking && reservasi.tanggal_dl_booking < new Date()
    if (
        reservasi.status === 'batal' || reservasiSudahExpired
    ) {
        // Bisa batal kalau sudah buat tapi belum expired
        throw new Error("Reservasi sudah batal atau kadaluarsa")
    }

    const lastCODate = new Date(reservasi.departure_date.setHours(12, 0, 0, 0))
    if (new Date() > lastCODate) {
        throw new Error("Reservasi tidak bisa dibatalkan karena sudah melewati tanggal check in")
    }

    await prisma.reservasi.update({
        where: {
            id: idReservasi
        },
        data: {
            status: 'batal',
            updated_at: new Date()
        }
    })

    let batalMessage: string
    if (reservasiBelumSelesai) {
        batalMessage = "Reservasi yang belum selesai ini berhasil dibatalkan"
    } else if(reservasi.arrival_date > moment().add(7, 'days').toDate()) {
        batalMessage = "Reservasi berhasil dibatalkan dan uang akan dikembalikan"
    } else {
        batalMessage = "Reservasi berhasil dibatalkan dan uang tidak dikembalikan"
    }

    return batalMessage
}

export default class ReservasiController {
    // Pegawai routes
    static async indexP(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const user = req.data!!.user

        const { idC } = req.params // id customer

        const validation = Validation.query(req, {
            status: {
                required: false,
                in: ['upcoming', 'completed', 'cancelled']
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { status } = validation.validated()

        const reservasiList = await getAllBookings(+idC, status)

        const customer = await prisma.user_customer.findUnique({
            where: {
                id: +idC,
                type: "g"
            }
        })

        if (+idC !== -1 && !customer) {
            return ApiResponse.error(res, {
                message: "Customer tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data reservasi",
            data: {
                list: reservasiList,
                customer: customer
            }
        })
    }

    static async showP(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm', 'owner', 'fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { idC, id } = req.params // id reservasi

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: +id,
                id_customer: +idC,
                user_customer: {
                    type: req.data?.user.role === 'sm' ? 'g' : undefined // hanya tampilkan group kalau SM. FO butuh semua
                }
            },
            include: {
                user_customer: true,
                reservasi_rooms: {
                    include: {
                        kamar: true,
                        jenis_kamar: true
                    }
                },
                reservasi_layanan: {
                    include: {
                        layanan_tambahan: true
                    }
                },
                user_pegawai: true,
                invoice: true
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data reservasi",
            data: reservasi
        })
    }

    static async cancelP(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { idC, id } = req.params // id reservasi

        try {
            const batalMessage = await cancelBooking(+idC, +id)
            return ApiResponse.success(res, {
                message: batalMessage,
                data: null
            })
        } catch (e: any) {
            return ApiResponse.error(res, {
                message: e.message,
                errors: null
            }, 400)
        }
    }

    // Customer routes
    static async indexC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const validation = Validation.query(req, {
            status: {
                required: false,
                in: ['upcoming', 'completed', 'cancelled']
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { status } = validation.validated()

        const reservasiList = await getAllBookings(user.id!!, status)

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data reservasi",
            data: reservasiList
        })
    }

    static async showC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const { id } = req.params // id reservasi

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: +id,
                id_customer: user.id
            },
            include: {
                user_customer: true,
                reservasi_rooms: {
                    include: {
                        kamar: true,
                        jenis_kamar: true
                    }
                },
                reservasi_layanan: {
                    include: {
                        layanan_tambahan: true
                    }
                },
                invoice: true
            }
        })

        if (!reservasi) {
            return ApiResponse.error(res, {
                message: "Reservasi tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data reservasi",
            data: reservasi
        })
    }

    static async cancelC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const { id } = req.params // id reservasi

        try {
            const batalMessage = await cancelBooking(user.id!!, +id)
            return ApiResponse.success(res, {
                message: batalMessage,
                data: null
            })
        } catch (e: any) {
            return ApiResponse.error(res, {
                message: e.message,
                errors: null
            }, 400)
        }
    }
}

// Routing
export const routerP = Router()
routerP.get('/:idC', ReservasiController.indexP)
routerP.get('/:idC/:id', ReservasiController.showP)
routerP.delete('/:idC/:id', ReservasiController.cancelP)

export const routerC = Router()
routerC.get('/', ReservasiController.indexC)
routerC.get('/:id', ReservasiController.showC)
routerC.delete('/:id', ReservasiController.cancelC)