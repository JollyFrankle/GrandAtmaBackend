import { Request, Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { Kamar, ReservasiLayanan, ReservasiRooms } from "../modules/Models";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import moment from "moment-timezone";

export default class CheckInOutController {
    static async getListKetersediaanCurrently(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const listKamar = await prisma.kamar.findMany({
            orderBy: [
                {
                    no_kamar: 'asc'
                }, {
                    no_lantai: 'asc'
                }
            ]
        })

        const roomsToday = await prisma.reservasi_rooms.findMany({
            where: {
                reservasi: {
                    status: 'checkin',
                    checked_in: {
                        lte: new Date()
                    },
                    checked_out: {
                        gt: new Date()
                    }
                }
            },
            include: {
                reservasi: true
            }
        })

        /**
         * TSD = Tersedia
         * TRS = Terisi
         * COT = Check Out Today
         * UNV = Unavailable
         */
        const availibility: { kamar: Kamar, status: 'TSD' | 'TRS' | 'COT' | 'UNV' }[] = []
        const idCustomerMaintenance = 0 // ID customer kalau kamar sedang maintenance

        listKamar.map((kamar) => {
            const reservasi = roomsToday.find((rr) => rr.no_kamar === kamar.no_kamar)?.reservasi
            let status: 'TSD' | 'TRS' | 'COT' | 'UNV' = 'TSD'
            if (reservasi) {
                if (reservasi.id) {
                    status = 'TRS'
                }

                if (reservasi.id_customer === idCustomerMaintenance) {
                    status = 'UNV'
                }

                if (moment(reservasi.checked_out).isSame(moment(), 'day')) {
                    status = 'COT'
                }
            }

            availibility.push({
                kamar: kamar,
                status: status
            })
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data ketersediaan kamar',
            data: availibility
        })
    }
}

export const router = Router()
router.get('/ketersediaan', CheckInOutController.getListKetersediaanCurrently)