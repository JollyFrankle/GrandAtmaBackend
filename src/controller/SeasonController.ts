import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import moment from "moment";
import { Tarif } from "../modules/Models";
import Authentication from "../modules/Authentication";

export default class SeasonController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            search: {
                required: false
            },
            type: {
                required: false
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { search, type } = validation.validated()

        const seasonList = await prisma.season.findMany({
            where: {
                nama: {
                    contains: search
                },
                type: type
            },
            include: {
                tarif: {
                    include: {
                        jenis_kamar: true
                    }
                }
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data season",
            data: seasonList
        })
    }

    static async show(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const season = await prisma.season.findUnique({
            where: {
                id: +id
            },
            include: {
                tarif: true
            }
        })

        if (season === null) {
            return ApiResponse.error(res, {
                message: "Season tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data season",
            data: season
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 100
            },
            type: {
                required: true,
                in: ['l', 'h']
            },
            tanggal_start: {
                required: true,
                type: 'datetime',
                after: SeasonController.getTanggalMaxInputSeason()
            },
            tanggal_end: {
                required: true,
                type: 'datetime',
                after: 'tanggal_start'
            },
            tarif: {
                required: true,
                type: "array",
                customRule: (value) => {
                    const tarifs = value as Tarif[]

                    // cek duplicate jenis kamar
                    const idJenisKamarList = tarifs.map((it) => +it.id_jenis_kamar)
                    if (idJenisKamarList.length !== new Set(idJenisKamarList).size) {
                        return 'Terdapat jenis kamar yang sama!'
                    }
                    return tarifs.filter((it) => !it.id_jenis_kamar || !it.harga).length > 0 ? 'Tarif tidak lengkap!' : null
                }
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { nama, type, tanggal_start, tanggal_end, tarif } = validation.validated()

        // Get overlapping season
        const overlappingSeason = await prisma.season.findFirst({
            where: {
                OR: [
                    {
                        tanggal_start: {
                            lte: tanggal_start
                        },
                        tanggal_end: {
                            gte: tanggal_start
                        }
                    },
                    {
                        tanggal_start: {
                            lte: tanggal_end
                        },
                        tanggal_end: {
                            gte: tanggal_end
                        }
                    },
                    {
                        tanggal_start: {
                            gte: tanggal_start
                        },
                        tanggal_end: {
                            lte: tanggal_end
                        }
                    }
                ]
            }
        })

        if (overlappingSeason !== null) {
            return ApiResponse.error(res, {
                message: `Season tidak dapat diubah: sudah ada season ${overlappingSeason.nama} di tanggal ini.`,
                errors: null
            }, 422)
        }

        const season = await prisma.season.create({
            data: {
                nama: nama,
                type: type,
                tanggal_start: tanggal_start,
                tanggal_end: tanggal_end,
                updated_at: new Date()
            }
        })

        const tarifList = (tarif as Tarif[]).map((item) => {
            return {
                id_season: season.id,
                id_jenis_kamar: +item.id_jenis_kamar,
                harga: +item.harga
            }
        })

        await prisma.tarif.createMany({
            data: tarifList
        })

        return ApiResponse.success(res, {
            message: "Berhasil membuat season",
            data: season
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const bodyValidation = Validation.body(req, {
            nama: {
                maxLength: 100
            },
            type: {
                in: ['l', 'h']
            },
            tanggal_start: {
                type: 'datetime',
                after: SeasonController.getTanggalMaxInputSeason()
            },
            tanggal_end: {
                type: 'datetime',
                after: 'tanggal_start'
            },
            tarif: {
                required: true,
                type: "array",
                customRule: (value) => {
                    const tarifs = value as Tarif[]

                    // cek duplicate jenis kamar
                    const idJenisKamarList = tarifs.map((it) => +it.id_jenis_kamar)
                    if (idJenisKamarList.length !== new Set(idJenisKamarList).size) {
                        return 'Terdapat jenis kamar yang sama!'
                    }
                    return tarifs.filter((it) => !it.id_jenis_kamar || !it.harga).length > 0 ? 'Tarif tidak lengkap!' : null
                }
            }
        })

        if (bodyValidation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: bodyValidation.errors
            }, 422)
        }

        const { nama, type, tanggal_start, tanggal_end, tarif } = bodyValidation.validated()

        const season = await prisma.season.findFirst({
            where: {
                id: +id
            }
        })

        if (season === null) {
            return ApiResponse.error(res, {
                message: "Season tidak ditemukan",
                errors: null
            }, 404)
        }

        // if tanggalStart < now + 2 bulan, return error
        if (moment(season.tanggal_start).isBefore(SeasonController.getTanggalMaxInputSeason())) {
            return ApiResponse.error(res, {
                message: "Season tidak dapat diubah: tanggal mulai kurang dari 2 bulan dari sekarang",
                errors: null
            }, 422)
        }

        // check if there is overlapping season
        const overlappingSeason = await prisma.season.findFirst({
            where: {
                id: {
                    not: +id
                },
                OR: [
                    {
                        tanggal_start: {
                            lte: tanggal_start
                        },
                        tanggal_end: {
                            gte: tanggal_start
                        }
                    },
                    {
                        tanggal_start: {
                            lte: tanggal_end
                        },
                        tanggal_end: {
                            gte: tanggal_end
                        }
                    },
                    {
                        tanggal_start: {
                            gte: tanggal_start
                        },
                        tanggal_end: {
                            lte: tanggal_end
                        }
                    }
                ]
            }
        })

        if (overlappingSeason !== null) {
            return ApiResponse.error(res, {
                message: `Season tidak dapat diubah: sudah ada season ${overlappingSeason.nama} di tanggal ini.`,
                errors: null
            }, 422)
        }

        await prisma.season.update({
            where: {
                id: +id
            },
            data: {
                nama: nama,
                type: type,
                tanggal_start: tanggal_start,
                tanggal_end: tanggal_end
            }
        });

        const updatedIds: number[] = [];
        (tarif as Tarif[]).map(async (item) => {
            item.id_season = season.id
            item.harga = +item.harga
            item.id_jenis_kamar = +item.id_jenis_kamar
            if (item.id) {
                updatedIds.push(item.id)
                await prisma.tarif.update({
                    data: item,
                    where: {
                        id: item.id
                    }
                })
            } else {
                item.id = undefined
                const tarifNew = await prisma.tarif.create({
                    data: item
                })
                updatedIds.push(tarifNew.id)
            }
        })

        // delete tarif yang tidak ada di updatedIds
        await prisma.tarif.deleteMany({
            where: {
                id_season: +id,
                NOT: {
                    id: {
                        in: updatedIds
                    }
                }
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah data season",
            data: season
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['sm'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const season = await prisma.season.findFirst({
            where: {
                id: +id
            }
        })

        if (season === null) {
            return ApiResponse.error(res, {
                message: "Season tidak ditemukan",
                errors: null
            }, 404)
        }

        // if tanggalStart < now + 2 bulan, return error
        if (moment(season.tanggal_start).isBefore(SeasonController.getTanggalMaxInputSeason())) {
            return ApiResponse.error(res, {
                message: "Season tidak dapat dihapus: tanggal mulai kurang dari 2 bulan dari sekarang",
                errors: null
            }, 422)
        }

        await prisma.season.delete({
            where: {
                id: +id
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil menghapus data season",
            data: season
        })
    }

    private static getTanggalMaxInputSeason() {
        return moment().add(2, 'months').set({ hour: 0, minute: 0, second: 0, millisecond: 0})
    }
}

// Routing
export const router = Router()
router.get('/', SeasonController.index)
router.get('/:id', SeasonController.show)
router.post('/', SeasonController.store)
router.put('/:id', SeasonController.update)
router.delete('/:id', SeasonController.destroy)