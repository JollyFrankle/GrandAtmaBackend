import { Response, Router } from "express";
import { PegawaiRequest } from "../modules/Middlewares";
import { ApiResponse } from "../modules/ApiResponses";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import LaporanContent from "../modules/LaporanContent";


export default class LaporanController {
    /**
     * Laporan customer baru per bulan
     */
    static async laporan1(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['gm', 'owner'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            tahun: {
                required: true
            }
        })

        if (validation.fails()) {
            return ApiResponse.error(res, {
                message: "Validasi gagal",
                errors: validation.errors
            }, 422)
        }

        const { tahun } = validation.validated()

        const laporan = await LaporanContent.laporan1(+tahun)

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data laporan",
            data: laporan
        })
    }

    /**
     * Laporan Pendapatan Bulanan:
     * 1. Pendapatan dari reservasi
     *    - Rumus: `SUM of (uang muka)`
     *    - Sesuai dengan tanggal dp
     * 2. Pendapatan dari invoice
     *    - Rumus: `SUM of ((total harga kamar - uang muka) + layanan + pajak layanan)`
     *    - Sesuai dengan tanggal lunas
     *
     * Deposit tidak dihitung karena sudah dikembalikan waktu check out atau digunakan untuk membayar layanan
     */
    static async laporan2(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['gm', 'owner'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            tahun: {
                required: true
            }
        })

        const { tahun } = validation.validated()

        const laporan = await LaporanContent.laporan2(+tahun)

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data laporan",
            data: laporan
        })
    }

    /**
     * LAPORAN 3 AMBIGU!
     */
    static async laporan3(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['gm', 'owner'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            tahun: {
                required: true
            },
            bulan: {
                required: true
            }
        })

        const { tahun, bulan } = validation.validated()

        const laporan = await LaporanContent.laporan3(+tahun, +bulan)

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data laporan",
            data: laporan
        })
    }

    /**
     * Laporan 5 customer dengan reservasi terbanyak [AMBIGU]
     * - Jumlah reservasi: hanya menghitung reservasi yang sudah selesai
     * - Total pembayaran: grand total dari invoice
     * - Sesuai dengan tanggal pembuatan reservasi
     */
    static async laporan4(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['gm', 'owner'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const validation = Validation.query(req, {
            tahun: {
                required: true
            }
        })

        const { tahun } = validation.validated()

        const laporan = await LaporanContent.laporan4(+tahun)

        return ApiResponse.success(res, {
            message: "Berhasil mendapatkan data laporan",
            data: laporan
        })
    }
}

export const router = Router()
router.get("/1", LaporanController.laporan1)
router.get("/2", LaporanController.laporan2)
router.get("/3", LaporanController.laporan3)
router.get("/4", LaporanController.laporan4)