import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";

export default class FasilitasController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        return PrismaScope(async (prisma) => {
            const fasilitas = await prisma.layanan_tambahan.findMany()

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data fasilitas",
                data: fasilitas
            })
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 50
            },
            satuan: {
                required: true,
                maxLength: 10
            },
            tarif: {
                required: true,
                type: "number",
                min: 0
            },
            short_desc: {
                required: true,
                maxLength: 254
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { nama, satuan, tarif, short_desc } = validation.validated()

        return PrismaScope(async (prisma) => {
            const fasilitas = await prisma.layanan_tambahan.create({
                data: {
                    nama: nama,
                    satuan: satuan,
                    tarif: tarif,
                    gambar: "",
                    short_desc: short_desc
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil membuat fasilitas",
                data: fasilitas
            })
        })
    }

    static async show(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        return PrismaScope(async (prisma) => {
            const fasilitas = await prisma.layanan_tambahan.findUnique({
                where: {
                    id: +id
                }
            })

            if (fasilitas === null) {
                return ApiResponse.error(res, {
                    message: "Fasilitas tidak ditemukan",
                    errors: null
                }, 404)
            }

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data fasilitas",
                data: fasilitas
            })
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 50
            },
            satuan: {
                required: true,
                maxLength: 10
            },
            tarif: {
                required: true,
                type: "number",
                min: 0
            },
            short_desc: {
                required: true,
                maxLength: 254
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { nama, satuan, tarif, short_desc } = validation.validated()

        return PrismaScope(async (prisma) => {
            const fasilitas = await prisma.layanan_tambahan.update({
                where: {
                    id: +id
                },
                data: {
                    nama: nama,
                    satuan: satuan,
                    tarif: tarif,
                    short_desc: short_desc
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mengupdate fasilitas",
                data: fasilitas
            })
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        return PrismaScope(async (prisma) => {
            const fasilitas = await prisma.layanan_tambahan.delete({
                where: {
                    id: +id
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil menghapus fasilitas",
                data: fasilitas
            })
        })
    }
}

// Routing
export const router = Router()
router.get('/', FasilitasController.index)
router.get('/:id', FasilitasController.show)
router.post('/', FasilitasController.store)
router.put('/:id', FasilitasController.update)
router.delete('/:id', FasilitasController.destroy)