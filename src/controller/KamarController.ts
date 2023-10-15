import { Response } from "express";
import { PegawaiRequest } from "../Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Validation from "../modules/Validation";

export default class KamarController {
    static async index(req: PegawaiRequest, res: Response) {
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

        if (validation.hasErrors()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.getErrors()
            }, 422)
        }

        const { search, is_smoking, jenis_kamar, jenis_bed, no_lantai } = validation.validated()

        return PrismaScope(async (prisma) => {
            const kamarList = await prisma.kamar.findMany({
                where: {
                    no_kamar: {
                        contains: search
                    },
                    is_smoking: is_smoking,
                    id_jenis_kamar: jenis_kamar,
                    jenis_bed: jenis_bed,
                    no_lantai: no_lantai
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data kamar",
                data: kamarList
            })
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        const validation = Validation.body(req, {
            no_kamar: {
                required: true
            },
            id_jenis_kamar: {
                required: true
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

        if (validation.hasErrors()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.getErrors()
            }, 422)
        }

        const { no_kamar, id_jenis_kamar, jenis_bed, no_lantai, is_smoking } = validation.validated()

        return PrismaScope(async (prisma) => {
            const kamar = await prisma.kamar.create({
                data: {
                    no_kamar,
                    id_jenis_kamar,
                    jenis_bed,
                    no_lantai,
                    is_smoking
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil membuat kamar",
                data: kamar
            })
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        const noKamarValidation = Validation.params(req, {
            no_kamar: {
                required: true
            }
        })

        if (noKamarValidation.hasErrors()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: noKamarValidation.getErrors()
            }, 422)
        }

        const { no_kamar } = noKamarValidation.validated()

        const validation = Validation.body(req, {
            id_jenis_kamar: {
                required: true
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

        if (validation.hasErrors()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.getErrors()
            }, 422)
        }

        const { id_jenis_kamar, jenis_bed, no_lantai, is_smoking } = validation.validated()

        return PrismaScope(async (prisma) => {
            const kamar = await prisma.kamar.update({
                where: {
                    no_kamar: no_kamar
                },
                data: {
                    id_jenis_kamar,
                    jenis_bed,
                    no_lantai,
                    is_smoking
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mengubah data kamar",
                data: kamar
            })
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        const validation = Validation.params(req, {
            no_kamar: {
                required: true
            }
        })

        if (validation.hasErrors()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.getErrors()
            }, 422)
        }

        const { no_kamar } = validation.validated()

        return PrismaScope(async (prisma) => {
            await prisma.kamar.delete({
                where: {
                    no_kamar: no_kamar
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil menghapus data kamar",
                data: null
            })
        })
    }
}