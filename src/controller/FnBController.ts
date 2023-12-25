import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import ImageUpload, { multerUploadDest } from "../modules/ImageUpload";

export default class FnBController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['fnb'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { kategori } = req.query
        if (kategori && !+kategori) {
            return ApiResponse.error(res, {
                message: "Kategori tidak valid",
                errors: {
                    kategori: "Kategori tidak valid"
                }
            }, 400)
        }

        const list = await prisma.fnb.findMany({
            where: {
                id_kategori: kategori ? +kategori : undefined
            },
            include: {
                fnb_kategori: true
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data Food & Beverage",
            data: list
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['fnb'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            id_kategori: {
                required: true,
                type: "number",
                min: 1
            },
            nama: {
                required: true,
                maxLength: 50
            },
            deskripsi: {
                required: true
            },
            harga: {
                required: true,
                type: "number",
                min: 0
            },
            availability_time: {
                required: true,
                customRule: (value) => {
                    // if is not JSON array of number
                    if (!Array.isArray(value)) {
                        return "Availability time harus berupa array"
                    }
                    for (const val of value) {
                        const number = +val
                        if (![1, 2, 3, 4, 5].includes(number)) {
                            return "Availability time antara Early Morning (1), Morning (2), Afternoon (3), Late Afternoon (4), atau Evening (5)"
                        }
                    }
                    return null
                }
            },
            availabilty_day: {
                required: true,
                customRule: (value) => {
                    // if is not JSON array of number
                    if (!Array.isArray(value)) {
                        return "Availability day harus berupa array"
                    }
                    for (const val of value) {
                        const number = +val
                        if (![1, 2].includes(number)) {
                            return "Availability day antara Weekdays (1) atau Weekends (2)"
                        }
                    }
                    return null
                }
            },
            gambar: {
                required: false,
                type: "file_single"
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { id_kategori, nama, deskripsi, harga, availability_time, availabilty_day } = validation.validated()

        // Upload gambar
        const { file } = req
        const result = await ImageUpload.handlesingleUpload("gambar", file)
        if (!result.success) {
            return ApiResponse.error(res, {
                message: "Gagal mengupload gambar",
                errors: result.errors
            }, 422)
        }

        // Check for silimar name
        const similar = await prisma.fnb.findMany({
            where: {
                nama: nama
            }
        })

        if (similar.length > 0) {
            return ApiResponse.error(res, {
                message: "Nama sudah digunakan",
                errors: {
                    nama: "Nama sudah digunakan"
                }
            }, 422)
        }

        // Check kategori
        const kategori = await prisma.fnb_kategori.findFirst({
            where: {
                id: id_kategori
            }
        })

        if (kategori === null) {
            return ApiResponse.error(res, {
                message: "Kategori tidak valid",
                errors: {
                    id_kategori: "Kategori tidak valid"
                }
            }, 400)
        }

        // Insert
        const fnb = await prisma.fnb.create({
            data: {
                id_kategori: id_kategori,
                nama: nama,
                deskripsi: deskripsi,
                harga: +harga,
                gambar: result.data.uid,
                availability_time: availability_time,
                availabilty_day: availabilty_day
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil membuat Food & Beverage",
            data: fnb
        })
    }

    static async show(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['fnb'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const fnb = await prisma.fnb.findUnique({
            where: {
                id: +id
            },
            include: {
                fnb_kategori: true
            }
        })

        if (fnb === null) {
            return ApiResponse.error(res, {
                message: "Food & Beverage tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data Food & Beverage",
            data: fnb
        })
    }
    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['fnb'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const validation = Validation.body(req, {
            id_kategori: {
                required: true,
                type: "number",
                min: 1
            },
            nama: {
                required: true,
                maxLength: 50
            },
            deskripsi: {
                required: true
            },
            harga: {
                required: true,
                type: "number",
                min: 0
            },
            availability_time: {
                required: true,
                customRule: (value) => {
                    // if is not JSON array of number
                    if (!Array.isArray(value)) {
                        return "Availability time harus berupa array"
                    }
                    for (const val of value) {
                        const number = +val
                        if (![1, 2, 3, 4, 5].includes(number)) {
                            return "Availability time antara Early Morning (1), Morning (2), Afternoon (3), Late Afternoon (4), atau Evening (5)"
                        }
                    }
                    return null
                }
            },
            availabilty_day: {
                required: true,
                customRule: (value) => {
                    // if is not JSON array of number
                    if (!Array.isArray(value)) {
                        return "Availability day harus berupa array"
                    }
                    for (const val of value) {
                        const number = +val
                        if (![1, 2].includes(number)) {
                            return "Availability day antara Weekdays (1) atau Weekends (2)"
                        }
                    }
                    return null
                }
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { id_kategori, nama, deskripsi, harga, availability_time, availabilty_day } = validation.validated()

        // Check for similar name
        const similar = await prisma.fnb.findMany({
            where: {
                nama: nama,
                id: {
                    not: +id
                }
            }
        })

        if (similar.length > 0) {
            return ApiResponse.error(res, {
                message: "Nama sudah digunakan",
                errors: {
                    nama: "Nama sudah digunakan"
                }
            }, 422)
        }

        // Check kategori
        const kategori = await prisma.fnb_kategori.findFirst({
            where: {
                id: id_kategori
            }
        })

        if (kategori === null) {
            return ApiResponse.error(res, {
                message: "Kategori tidak valid",
                errors: {
                    id_kategori: "Kategori tidak valid"
                }
            }, 400)
        }

        // Update
        const fnb = await prisma.fnb.update({
            where: {
                id: +id
            },
            data: {
                id_kategori: id_kategori,
                nama: nama,
                deskripsi: deskripsi,
                harga: +harga,
                availability_time: availability_time,
                availabilty_day: availabilty_day
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengupdate Food & Beverage",
            data: fnb
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['fnb'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { id } = req.params

        const fnb = await prisma.fnb.findUnique({
            where: {
                id: +id
            }
        })

        if (fnb === null) {
            return ApiResponse.error(res, {
                message: "Food & Beverage tidak ditemukan",
                errors: null
            }, 404)
        }

        // Delete gambar
        if (fnb.gambar !== null) {
            await ImageUpload.delete(fnb.gambar)
        }

        await prisma.fnb.delete({
            where: {
                id: +id
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil menghapus Food & Beverage",
            data: fnb
        })
    }
}

// Routing
export const router = Router()
router.get("/", FnBController.index)
router.get("/:id", FnBController.show)
router.post("/", multerUploadDest.single("gambar"), FnBController.store)
router.put("/:id", FnBController.update)
router.delete("/:id", FnBController.destroy)