import { Request, Response, Router } from "express";
import { CustomerRequest, PegawaiRequest } from "../modules/Middlewares";
import { Kamar, Reservasi, ReservasiLayanan, ReservasiRooms } from "../modules/Models";
import { ApiResponse } from "../modules/ApiResponses";
import { prisma } from "../modules/PrismaService";
import Validation from "../modules/Validation";
import Authentication from "../modules/Authentication";
import moment from "moment-timezone";

interface KamarAvailibility {
    no_kamar: string,
    reservasi: Reservasi | null,
    status: 'TSD' | 'TRS' | 'COT' | 'UNV'
}

async function getKeterisianKamarHariIni(noLantai?: number) {
    const listKamar = await prisma.kamar.findMany({
        where: {
            no_lantai: noLantai
        },
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
                departure_date: {
                    gte: new Date()
                }
            }
        },
        include: {
            reservasi: {
                include: {
                    user_customer: true
                }
            }
        }
    })

    /**
     * TSD = Tersedia
     * TRS = Terisi
     * COT = Check Out Today
     * UNV = Unavailable
     */
    const availibility: KamarAvailibility[] = []
    const idCustomerMaintenance = 0 // ID customer kalau kamar sedang maintenance

    listKamar.map((kamar) => {
        const reservasi = roomsToday.find((rr) => rr.no_kamar === kamar.no_kamar)?.reservasi
        let status: KamarAvailibility['status'] = 'TSD'
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
            no_kamar: kamar.no_kamar,
            reservasi: reservasi ?? null,
            status: status
        })
    })

    return availibility
}

export default class CheckInOutController {
    static async getListKetersediaanCurrently(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const { no_lantai } = req.query

        let noLantai: number | undefined = undefined
        if (no_lantai && (+no_lantai) >= 1 && (+no_lantai) <= 4) {
            noLantai = +no_lantai
        }

        const availibility = await getKeterisianKamarHariIni(noLantai)

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data ketersediaan kamar',
            data: availibility
        })
    }

    // List tamu yang belum check in (status reservasi = lunas/DP, arrival_date <= hari ini)
    static async getListCheckInToday(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const roomsToday = await prisma.reservasi.findMany({
            where: {
                status: {
                    in: ['lunas', 'dp'] // hanya yg sudah lunas/DP yang boleh check in
                },
                checked_in: null, // kalau sudah check in, tidak boleh check in lagi
                arrival_date: {
                    lte: new Date() // arrival hari ini atau kemarin boleh check in (kalau sudah > jam check out auto diset BATAL: ditangani cron job)
                },
                departure_date: {
                    gt: new Date() // departure hari ini atau <= kemarin boleh check out (kalau sudah > jam check out auto diset BATAL, ditangani cron job)
                }
            },
            orderBy: {
                arrival_date: 'desc' // biar tampil hari ini duluan, yang kemarin-kemarin terakhir
            },
            include: {
                user_customer: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check in hari ini',
            data: roomsToday
        })
    }

    // List tamu yang belum check out (status reservasi = checkin, departure_date <= hari ini)
    static async getListCheckOutToday(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const roomsToday = await prisma.reservasi.findMany({
            where: {
                status: 'checkin', // kalau statusnya masih checkin, berarti belum check out
                departure_date: {
                    lte: new Date() // departure hari ini atau <= kemarin boleh check out (kalau sudah > jam check out auto diset BATAL, ditangani cron job)
                }
            },
            orderBy: {
                departure_date: 'desc' // biar tampil hari ini duluan
            },
            include: {
                user_customer: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data check out hari ini',
            data: roomsToday
        })
    }

    // List tamu yang masih menginap (status reservasi = checkin) --> untuk bisa memesan layanan
    static async getListTamuMenginap(req: PegawaiRequest, res: Response) {
        if (!Authentication.authorization(req, ['fo'])) {
            return Authentication.defaultUnauthorizedResponse(res)
        }

        const roomsToday = await prisma.reservasi_rooms.findMany({
            where: {
                reservasi: {
                    status: 'checkin' // kalau statusnya masih checkin, berarti masih menginap
                }
            },
            include: {
                reservasi: true
            }
        })

        return ApiResponse.success(res, {
            message: 'Berhasil mendapatkan data tamu yang sedang menginap',
            data: roomsToday
        })
    }

    static async checkIn(req: PegawaiRequest, res: Response) {
        const validation = Validation.body(req, {
            id: {
                required: true,
                type: 'number'
            },
            deposit: {
                required: true,
                type: 'number',
                min: 300000
            },
            no_kamar: {
                required: true,
                type: "array",
                customRule: (value: any[]) => {
                    if (value.length === 0) {
                        return 'No kamar harus diisi'
                    }

                    return null

                }
            }
        })
    }
}

export const router = Router()
router.get('/ketersediaan', CheckInOutController.getListKetersediaanCurrently)
router.get('/checkin', CheckInOutController.getListCheckInToday)
router.get('/checkout', CheckInOutController.getListCheckOutToday)
router.get('/menginap', CheckInOutController.getListTamuMenginap)