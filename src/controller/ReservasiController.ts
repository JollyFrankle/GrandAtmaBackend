import { Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import { Prisma } from "@prisma/client";

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
                        arrival_date: {
                            gte: new Date(new Date().setHours(0, 0, 0, 0))
                        }
                    }
                ]
            }
        } else if (status === "completed") {
            statusQuery = {
                // tanggal check out < hari ini
                departure_date: {
                    lt: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        } else if (status === "cancelled") {
            statusQuery = {
                OR: [
                    {
                        status: "batal"
                    },
                    {
                        tanggal_dl_booking: {
                            lt: new Date()
                        }
                    }
                ]
            }
        }

        const reservasiList = await prisma.reservasi.findMany({
            where: {
                id_customer: +idC,
                user_customer: {
                    type: 'g' // hanya tampilkan kalau group request bukan individual
                },
                ...statusQuery
            },
            include: {
                user_customer: true,
                user_pegawai: true
            }
        })

        const customer = await prisma.user_customer.findUnique({
            where: {
                id: +idC,
                type: "g"
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data reservasi",
            data: {
                list: reservasiList,
                customer: customer
            }
        })
    }

    static async showP(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const user = req.data!!.user
        if (!['sm', 'owner'].includes(user.role)) {
            return ApiResponse.error(res, {
                message: "Hanya pegawai Sales & Marketing yang bisa mengakses halaman ini",
                errors: null
            }, 403)
        }

        const { idC, id } = req.params // id reservasi

        const reservasi = await prisma.reservasi.findUnique({
            where: {
                id: +id,
                id_customer: +idC,
                user_customer: {
                    type: 'g' // hanya tampilkan kalau group request bukan individual
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
                        arrival_date: {
                            gte: new Date(new Date().setHours(0, 0, 0, 0))
                        }
                    }
                ]
            }
        } else if (status === "completed") {
            statusQuery = {
                // tanggal check out < hari ini
                departure_date: {
                    lt: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        } else if (status === "cancelled") {
            statusQuery = {
                OR: [
                    {
                        status: "batal"
                    },
                    {
                        tanggal_dl_booking: {
                            lt: new Date()
                        }
                    }
                ]
            }
        }

        const reservasiList = await prisma.reservasi.findMany({
            where: {
                id_customer: user.id,
                ...statusQuery
            },
            include: {
                invoice: true
            }
        })

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
}

// Routing
export const routerP = Router()
routerP.get('/:idC', ReservasiController.indexP)
routerP.get('/:idC/:id', ReservasiController.showP)

export const routerC = Router()
routerC.get('/', ReservasiController.indexC)
routerC.get('/:id', ReservasiController.showC)