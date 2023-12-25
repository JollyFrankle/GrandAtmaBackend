import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import ImageUpload, { multerUploadDest } from "../modules/ImageUpload";

export default class FnBKategoriController {
    static async index(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const list = await prisma.fnb_kategori.findMany()

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data kategori Food & Beverage",
            data: list
        })
    }

    static async store(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 50
            },
            deskripsi: {
                required: true,
                maxLength: 254
            },
            icon: {
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

        const { nama, deskripsi } = validation.validated()

        // Upload icon
        const { file } = req
        const result = await ImageUpload.handlesingleUpload("icon", file)
        if (!result.success) {
            return ApiResponse.error(res, {
                message: "Gagal mengupload icon",
                errors: result.errors
            }, 422)
        }

        // Check for similar name
        const similar = await prisma.fnb_kategori.findMany({
            where: {
                nama: nama
            }
        })

        if (similar.length > 0) {
            return ApiResponse.error(res, {
                message: "Nama kategori sudah digunakan",
                errors: {
                    nama: "Nama kategori sudah digunakan"
                }
            }, 422)
        }

        const fnbKategori = await prisma.fnb_kategori.create({
            data: {
                nama: nama,
                deskripsi: deskripsi,
                icon: result.data.uid
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil menambahkan kategori Food & Beverage",
            data: fnbKategori
        })
    }

    static async show(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const id = req.params.id

        const fnbKategori = await prisma.fnb_kategori.findFirst({
            where: {
                id: +id
            }
        })

        if (fnbKategori === null) {
            return ApiResponse.error(res, {
                message: "Kategori tidak ditemukan",
                errors: null
            }, 404)
        }

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data kategori Food & Beverage",
            data: fnbKategori
        })
    }

    static async update(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.body(req, {
            nama: {
                required: true,
                maxLength: 50
            },
            deskripsi: {
                required: true,
                maxLength: 254
            },
            icon: {
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

        const id = req.params.id
        const { nama, deskripsi } = validation.validated()

        // Upload icon
        const { file } = req
        const result = await ImageUpload.handlesingleUpload("icon", file)
        if (!result.success) {
            return ApiResponse.error(res, {
                message: "Gagal mengupload icon",
                errors: result.errors
            }, 422)
        }

        // Check for similar name
        const similar = await prisma.fnb_kategori.findMany({
            where: {
                nama: nama,
                id: {
                    not: +id
                }
            }
        })

        if (similar.length > 0) {
            return ApiResponse.error(res, {
                message: "Nama kategori sudah digunakan",
                errors: {
                    nama: "Nama kategori sudah digunakan"
                }
            }, 422)
        }

        const fnbKategori = await prisma.fnb_kategori.update({
            where: {
                id: +id
            },
            data: {
                nama: nama,
                deskripsi: deskripsi,
                icon: result.data.uid
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil mengubah data kategori Food & Beverage",
            data: fnbKategori
        })
    }

    static async destroy(req: PegawaiRequest, res: Response) {
        if(!Authentication.authorization(req, ['admin'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const id = req.params.id

        // check if there is any fnb with this category
        const fnb = await prisma.fnb.findMany({
            where: {
                id_kategori: +id
            }
        })

        if (fnb.length > 0) {
            return ApiResponse.error(res, {
                message: `Kategori tidak dapat dihapus karena masih ada ${fnb.length} Food & Beverage yang menggunakan kategori ini`,
                errors: null
            }, 422)
        }

        const fnbKategori = await prisma.fnb_kategori.delete({
            where: {
                id: +id
            }
        })

        return ApiResponse.success(res, {
            message: "Berhasil menghapus data kategori Food & Beverage",
            data: fnbKategori
        })
    }
}

export const router = Router()
router.get("/", FnBKategoriController.index)
router.get("/:id", FnBKategoriController.show)
router.post("/", multerUploadDest.single("icon"), FnBKategoriController.store)
router.put("/:id", multerUploadDest.single("icon"), FnBKategoriController.update)
router.delete("/:id", FnBKategoriController.destroy)