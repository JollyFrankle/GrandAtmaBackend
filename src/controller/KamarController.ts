import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";

export default class KamarController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            search: {
                required: false
            },
            is_smoking: {
                required: false
            },
            jenis_kamar: {
                required: false
            },
            jenis_bed: {
                required: false
            },
            no_lantai: {
                required: false
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { search, is_smoking, jenis_kamar, jenis_bed, no_lantai } = validation.validated()

        const kamarList = await prisma.kamar.findMany({
            where: {
                no_kamar: {
                    contains: search
                },
                is_smoking: is_smoking,
                id_jenis_kamar: jenis_kamar,
                jenis_bed: jenis_bed,
                no_lantai: no_lantai
            },
            include: {
                jenis_kamar: true
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data kamar",
            data: kamarList
        })
    }

    static async show(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { no_kamar } = req.params

        const kamar = await prisma.kamar.findUnique({
            where: {
                no_kamar: no_kamar
            },
            include: {
                jenis_kamar: true
            }
        })

        if (!kamar) {
            return ApiResponse.error(res, {
                message: "Kamar tidak ditemukan",
                errors: {}
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data kamar",
            data: kamar
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            no_kamar: {
                required: true
            },
            id_jenis_kamar: {
                required: true,
                type: 'number'
            },
            jenis_bed: {
                required: true
            },
            no_lantai: {
                required: true
            },
            is_smoking: {
                required: true
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { no_kamar, id_jenis_kamar, jenis_bed, no_lantai, is_smoking } = validation.validated()

        const allowedBedTypes = await prisma.jenis_kamar.findFirst({
            where: {
                id: id_jenis_kamar
            },
            select: {
                tipe_bed: true
            }
        })

        const tipeBed = JSON.parse(allowedBedTypes?.tipe_bed || '[]')
        if (!tipeBed.includes(jenis_bed)) {
            return ApiResponse.error(res, {
                message: "Jenis bed tidak tersedia untuk jenis kamar ini",
                errors: {
                    jenis_bed: "Jenis bed tidak tersedia untuk jenis kamar ini"
                }
            }, 422)
        }

        // Check if kamar already exists
        const kamarExists = await prisma.kamar.findUnique({
            where: {
                no_kamar: no_kamar
            }
        })

        if (kamarExists) {
            return ApiResponse.error(res, {
                message: "Kamar sudah ada",
                errors: {
                    no_kamar: "Kamar sudah ada"
                }
            }, 422)
        }

        const kamar = await prisma.kamar.create({
            data: {
                no_kamar,
                id_jenis_kamar: +id_jenis_kamar,
                jenis_bed,
                no_lantai: +no_lantai,
                is_smoking: +is_smoking
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil membuat kamar",
            data: kamar
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const noKamarValidation = Validation.params(req, {
            no_kamar: {
                required: true
            }
        })

        if (noKamarValidation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: noKamarValidation.errors
            }, 422)
        }

        const { no_kamar } = noKamarValidation.validated()

        const validation = Validation.body(req, {
            id_jenis_kamar: {
                required: true,
                type: 'number'
            },
            jenis_bed: {
                required: true
            },
            no_lantai: {
                required: true
            },
            is_smoking: {
                required: true
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { id_jenis_kamar, jenis_bed, no_lantai, is_smoking } = validation.validated()

        const allowedBedTypes = await prisma.jenis_kamar.findFirst({
            where: {
                id: id_jenis_kamar
            },
            select: {
                tipe_bed: true
            }
        })

        const tipeBed = JSON.parse(allowedBedTypes?.tipe_bed || '[]')
        if (!tipeBed.includes(jenis_bed)) {
            return ApiResponse.error(res, {
                message: "Jenis bed tidak tersedia untuk jenis kamar ini",
                errors: {
                    jenis_bed: "Jenis bed tidak tersedia untuk jenis kamar ini"
                }
            }, 422)
        }

        const kamar = await prisma.kamar.update({
            where: {
                no_kamar: no_kamar
            },
            data: {
                id_jenis_kamar,
                jenis_bed,
                no_lantai: +no_lantai,
                is_smoking: +is_smoking,
                updated_at: new Date()
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah data kamar",
            data: kamar
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { no_kamar } = req.params

        await prisma.kamar.delete({
            where: {
                no_kamar: no_kamar
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil menghapus data kamar",
            data: null
        })
    }

    static async getAllJenisKamar(_: PegawaiRequest, res: Response) {
        const jenisKamarList = await prisma.jenis_kamar.findMany()

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data jenis kamar",
            data: jenisKamarList
        })
    }
}

// Routing
export const router = Router()
router.get('/', KamarController.index)
router.get('/jenis', KamarController.getAllJenisKamar)
router.get('/:no_kamar', KamarController.show)
router.post('/', KamarController.store)
router.put('/:no_kamar', KamarController.update)
router.delete('/:no_kamar', KamarController.destroy)