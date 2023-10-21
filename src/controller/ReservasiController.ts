import { Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";

export default class ReservasiController {
    // Pegawai routes
    static async indexP(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const user = req.data!!.user

        const { id } = req.params // id customer

        const validation = Validation.query(req, {
            status: {
                required: false
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { status } = validation.validated()

        return PrismaScope(async (prisma) => {
            const reservasiList = await prisma.reservasi.findMany({
                where: {
                    status: status,
                    id_customer: +id,
                    user_customer: {
                        type: 'g' // hanya tampilkan kalau group request bukan individual
                    }
                },
                include: {
                    user_customer: true,
                    user_pegawai: true
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data reservasi",
                data: reservasiList
            })
        })
    }

    static async showP(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const user = req.data!!.user
        if (!['sm', 'owner'].includes(user.role)) {
            return ApiResponse.error(res, {
                message: "Hanya pegawai Sales & Marketing yang bisa mengakses halaman ini",
                errors: null
            }, 403)
        }

        const { id } = req.params // id reservasi

        return PrismaScope(async (prisma) => {
            const reservasi = await prisma.reservasi.findUnique({
                where: {
                    id: +id
                },
                include: {
                    user_customer: true,
                    reservasi_rooms: {
                        include: {
                            kamar: true
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
        })
    }

    // Customer routes
    static async indexC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const validation = Validation.query(req, {
            status: {
                required: false
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { status } = validation.validated()

        return PrismaScope(async (prisma) => {
            const reservasiList = await prisma.reservasi.findMany({
                where: {
                    status: status,
                    id_customer: user.id
                },
                include: {
                    invoice: true
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data reservasi",
                data: reservasiList
            })
        })
    }

    static async showC(req: CustomerRequest, res: Response) {
        const user = req.data!!.user

        const { id } = req.params // id reservasi

        return PrismaScope(async (prisma) => {
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
        })
    }
}

// Routing
export const routerP = Router()
routerP.get('/', ReservasiController.indexP)
routerP.get('/:id', ReservasiController.showP)

export const routerC = Router()
routerC.get('/', ReservasiController.indexC)
routerC.get('/:id', ReservasiController.showC)