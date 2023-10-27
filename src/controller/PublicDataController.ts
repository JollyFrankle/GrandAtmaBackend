import { Response, Request, Router } from "express";
import { ApiResponse } from "../modules/ApiResponses";
import PrismaScope from "../modules/PrismaService";
import Utils from "../modules/Utils";
import Jimp from "jimp";
import Authentication from "../modules/Authentication";

export default class PublicDataController {
    static async getAllJenisKamar(req: Request, res: Response) {
        return PrismaScope(async (prisma) => {
            const jenisKamarList = await prisma.jenis_kamar.findMany({
                select: {
                    id: true,
                    nama: true,
                    gambar: true,
                    short_desc: true,
                    rating: true,
                    kapasitas: true,
                    ukuran: true,
                }
            })

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data jenis kamar",
                data: jenisKamarList
            })
        })
    }

    static async getJenisKamar(req: Request, res: Response) {
        const { id } = req.params

        return PrismaScope(async (prisma) => {
            const jenisKamar = await prisma.jenis_kamar.findFirst({
                where: {
                    id: +id
                }
            })

            if (jenisKamar === null) {
                return ApiResponse.error(res, {
                    message: "Jenis kamar tidak ditemukan",
                    errors: null
                }, 404)
            }

            jenisKamar.harga_dasar = 0 // hide from public

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data jenis kamar",
                data: jenisKamar
            })
        })
    }

    static async getLayananTambahan(req: Request, res: Response) {
        return PrismaScope(async (prisma) => {
            const layananTambahanList = await prisma.layanan_tambahan.findMany()

            return ApiResponse.success(res, {
                message: "Berhasil mendapatkan data layanan tambahan",
                data: layananTambahanList
            })
        })
    }

    static async getImage(req: Request, res: Response) {
        const { id } = req.params

        return PrismaScope(async (prisma) => {
            const image = await prisma.images.findUnique({
                where: {
                    uid: id
                }
            })

            if (image === null) {
                return ApiResponse.error(res, {
                    message: "Gambar tidak ditemukan",
                    errors: null
                }, 404)
            }

            // Caching
            res.set('Cache-Control', 'public, max-age=31557600');
            res.set('Expires', new Date(Date.now() + 31557600).toUTCString());
            return res.type("image/jpeg").send(image.data)
        })
    }
}

export const router = Router()
router.get('/jenis-kamar', PublicDataController.getAllJenisKamar)
router.get('/jenis-kamar/:id', PublicDataController.getJenisKamar)
router.get('/layanan-tambahan', PublicDataController.getLayananTambahan)
router.get('/image/:id', PublicDataController.getImage)